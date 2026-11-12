# A decision message

The example below is invented. Keep its order ([Order the message](../SKILL.md#order-the-message)),
its bold labels, and its form: the frames, the caller-first code, and the table with its marks.
Invent the content, and drop the counter ("Decision 2 of 4") when the message holds the only
decision.

````markdown
**Decision 2 of 4: how a failed webhook gets retried**

**Where we are.** When a user publishes a recipe, the API sends a webhook to each subscriber,
inline:

```text
┌──────┐  publish   ┌─────┐  POST (inline)  ┌────────────┐
│ user │ ─────────▶ │ API │ ──────────────▶ │ subscriber │
└──────┘            └─────┘                 └────────────┘
                       │
                       ▼
                   ┌──────┐
                   │  db  │  recipe row
                   └──────┘
```

Today a failed POST is lost. From `src/publish/send-webhooks.ts`:

```ts
await post(subscriber.url, payload); // TODO: retry
```

**Option A: in-process retry.**

```text
┌──────┐  publish   ┌─────┐  POST + retry   ┌────────────┐
│ user │ ─────────▶ │ API │ ──────────────▶ │ subscriber │
└──────┘            └─────┘                 └────────────┘
                       │   ✗ the retries wait in memory, so a deploy or crash loses them
                       ▼
                   ┌──────┐
                   │  db  │  recipe row
                   └──────┘
```

```ts
// the caller, unchanged
await publishRecipe(recipe);
// inside: the retries live in this call's memory
await sendWithRetry(subscriber, payload, { delaysMS: [1_000, 4_000, 16_000] });
```

**Option B: outbox with a worker.**

```text
┌──────┐  publish   ┌─────┐                 ┌────────────┐
│ user │ ─────────▶ │ API │                 │ subscriber │
└──────┘            └─────┘                 └────────────┘
                       │  one transaction         ▲  POST, retry
                       ▼                          │
                   ┌──────────────┐  claims  ┌────────┐
                   │  db          │ ◀─────── │ worker │
                   │  recipe row  │          └────────┘
                   │  outbox row  │  ✓ the row outlives a deploy or crash
                   └──────────────┘  ✗ each webhook waits up to 1 s for the next poll
```

```ts
// the caller: the webhook is a row, written with the recipe
await db.transaction().execute(async (tx) => {
  await insertRecipe(tx, recipe);
  await enqueueWebhooks(tx, { recipeID: recipe.id, event: 'recipe.published' });
});
// the worker: one loop, claims rows that are due
const worker = createOutboxWorker({
  db,
  send: postWebhook,
  delaysMS: [1_000, 4_000, 16_000, 60_000],
  pollMS: 1_000,
});
```

```sql
CREATE TABLE outbox (
  id              INTEGER PRIMARY KEY,
  recipe_id       INTEGER NOT NULL,
  event           TEXT    NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,   -- epoch ms; the worker claims rows due now
  sent_at         INTEGER             -- NULL until delivered
);
```

|                                     | A: in-process retry     | B: outbox with a worker  |
| ----------------------------------- | ----------------------- | ------------------------ |
| Survives a deploy or crash          | ✗                       | ✓                        |
| Publish returns at once             | ✗ waits up to 21 s      | ✓                        |
| Sends at once                       | ✓                       | ✗ up to 1 s later        |
| A dead subscriber's webhook is kept | ✗ dropped after 4 tries | ✓ row kept after 5 tries |
| Effort                              | about 1 hour            | about half a day         |

**Rejected: a queue service (C),** which adds a service to run, against `docs/vision.md`: "One
process, one database, until a number says otherwise."

**Recommendation: B, the outbox with a worker.** A webhook survives a deploy or a crash, and a retry
never blocks the request that caused it. It costs one table, one worker loop, and up to 1 s of delay
per webhook.

**The decision I need:** B, the outbox with a worker, or A, the in-process retry?
````

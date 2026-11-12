# Judge

The judge scores the sketches blind. It reads only the prompt below and the anonymous sketch
folders: never this conversation, the subagents' replies, or which letter is the user's design.

## Who judges

Take the first judge that runs:

1. **Codex,** when `codex` is on the `PATH`. It comes from another model family, so it doesn't share
   your blind spots.

   ```bash
   codex exec -s read-only --skip-git-repo-check -c model_reasoning_effort=medium \
     -o <reply.md> "$(cat <prompt.md>)" < /dev/null
   ```

   Run it in the background. It's done when the job exits and `<reply.md>` isn't empty. When it
   fails, or gives no reply in 15 minutes, stop it and use the next judge.

2. **A fresh Claude subagent,** with the general agent type and `model: "opus"`. Never a fork,
   because a fork inherits this conversation and isn't blind. Give it the same prompt. It comes from
   your own model family, so say so in the report.

## The prompt

Write it to a file in your scratch directory, in this order:

1. The ask: "Score each sketch below from 1 to 5 on each criterion, then pick one."
2. The problem and its requirements, word for word as the sketchers got them.
3. The criteria, numbered.
4. The full text of [red-flags.md](./red-flags.md).
5. The absolute paths of the folders A, B, C (and D), and the instruction to read every file in
   each.
6. The reply shape:
   - a table with a row per criterion, a column per sketch, and a totals row, each cell a score and
     any red flag found;
   - for each score, one sentence on why;
   - for each criterion, which sketch handles it best, and which part of that sketch earns it;
   - the pick, and the reason for it.

Leave out the lenses, the user, any sketch you prefer, and the scores you expect.

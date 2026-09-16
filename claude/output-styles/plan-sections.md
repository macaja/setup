---
name: Plan sections
description: Plans follow a fixed section order and commit to decisions; everything else is unchanged
keep-coding-instructions: true
---

This style only applies to plans. A plan is any implementation proposal: the output of plan mode, a design sketch before code, or an answer to "how would you do X". Ordinary answers, explanations, code changes and reviews are not affected by anything below.

## Plan structure

Sections in this order. Bold is for these headings and nothing else. The whole plan fits on one screen unless the work genuinely does not; if a section has nothing worth saying, one line saying so.

**0. Open question, only if one blocks the work**

One sentence: what is undecided, and what the plan assumes meanwhile. Example: "Falta decidir si los tokens del formato viejo siguen funcionando durante el rollout — yo asumo que sí, los dos formatos por un release."

If the plan can be executed as written, skip this and start with the problem.

**1. Problem**

What is broken right now, concretely. Which file, which function, what breaks downstream. Two or three sentences, not a section.

**2. Changes**

One line or short paragraph per file that gets touched: the path, what changes, why that file. Order them so a reader going top to bottom never hits something that has not been introduced yet.

Call out anything new — new file, new dependency, new environment variable, new database column. New surface is where the bugs live.

**3. Things to watch**

What the plan assumes and what happens if the assumption is wrong. Whether it deploys in one step or needs a sequence, and how to undo it. Anything touching production data or callers outside the files being changed.

Be specific about the actual failure. "Clients still sending the old `user_id` field get a 400 after this; there are three in `integrations/`" — not "this could break existing clients".

**4. Tests**

What proves it works, and what proves the old behaviour still works. Name the cases: input, expected result, which layer (unit, integration, end to end). Include the ugly ones — empty result, timeout, malformed input, two writes at once.

If something cannot be tested, say which part and how it gets checked instead (manual step, staging, watching it after deploy).

## Uncertainty inside a plan

When a judgement call could have gone the other way, say so where it comes up, say which way it went, and why. Do not pile every open question into a list at the end, and do not hand over a menu of options instead of picking one.

Only what actually blocks the work goes in the opening line. A plan that opens with a pile of questions is one that was not thought through.

## No diagrams in chat

Chat output renders in a terminal, so never emit a Mermaid block in a plan answer. Diagrams belong in plan files written to disk (the `plan-feature` workflow asks for one there).

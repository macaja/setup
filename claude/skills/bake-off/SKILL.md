---
name: bake-off
description:
  'Puts the user''s own design up against independent sketches of the same problem before anyone
  commits to one: subagents each sketch it through a different lens, one subagent writes the user''s
  design down in the same format without improving it, a judge model scores every sketch blind
  against criteria no sketcher saw, and the best parts of the losers are grafted onto the winner.
  The result is shown through the show-me skill. Load it when the user has a design in mind and
  wants to see how it holds up, such as for a code challenge, a public API, a schema or a boundary
  several modules depend on. Not for a question a benchmark can answer.'
---

# Bake-off

The user has a design in mind and wants to know how it holds up. Write scoring criteria from the
problem alone, and let the user check them. Have separate subagents sketch the problem through
different lenses, and have one more subagent write the user's design down in the same format,
without improving it. Hand every sketch, under a shuffled letter, to a judge that doesn't know which
one is the user's. Pick the judge's winner, graft the best parts of the others onto it, and show the
whole thing through show-me.

- **Run it when there is more than one reasonable design.** Goals that pull against each other, such
  as speed against flexibility, are the sign. A code challenge counts: the point is to see where the
  user's design wins and where it loses.
- **When you can measure the answer, skip the bake-off.** When the question is which option is
  faster or smaller, benchmark it.
- **Keep the user's design anonymous until the scores are in.** Nothing the judge reads may say or
  hint which sketch is the user's.
- **Compare the sketches before anyone scores them.** When the sketches read the problem
  differently, the problem isn't clear yet, and scores can't fix that.
- **Rework what you graft.** A piece pasted from another sketch keeps that sketch's design.

## Key rules

- [Inputs](#inputs): the problem, the user's design, and the code it touches, if any.
- [Criteria](#criteria): 3 to 6, written from the problem before you weigh the user's design, and
  confirmed by the user.
- [Sketches](#sketches): one subagent per lens, plus one that transcribes the user's design, all in
  one message, each with `model: "sonnet"`.
- [Compare](#compare): when the sketches read the problem differently, report that and don't score.
- [Judge](#judge): a blind judge scores the shuffled sketch folders alone.
- [Pick and graft](#pick-and-graft): the judge's highest total, with the best parts of the others
  grafted on and rewritten.
- [Show the result](#show-the-result): through show-me, then the full report.

## References

- [sketcher.md](./references/sketcher.md): the instructions for each subagent that writes a sketch,
  including the one that transcribes the user's design.
- [judge.md](./references/judge.md): how to reach the judge, and the prompt to send it.
- [red-flags.md](./references/red-flags.md): the design red flags, for the judge.

## Inputs

You need:

- **The problem.** For a code challenge, the full statement. For work in a repo, what the design
  must do, and the requirements: the ones you were given, or two or three you write about behaviour
  only.
- **The user's design.** In any form: a paragraph, types, pseudocode, a diagram. When the user
  hasn't given one, ask for it in one line before you start, and wait. When the user says they have
  none, run the lenses alone.
- **The code it touches,** as absolute paths, when there is a repo. A code challenge from scratch
  has none.

## Criteria

Write 3 to 6 criteria for a good design for this problem, from what the problem needs, such as "a
new payment method touches one file" or "adding a new rule doesn't change the parser". Leave the red
flags in [red-flags.md](./references/red-flags.md) out of the criteria: the judge already lowers a
score for each red flag it finds, so a criterion that repeats one would count it twice.

You have read the user's design, so your criteria may lean toward it, or away from it. Guard
against that:

- Write each criterion from the problem statement and the requirements alone. Never write one that
  only the user's design, or only one way of building it, can meet.
- Show the user the criteria in one short message before any sketch starts, and ask whether to keep,
  change or add any. When the user brought their own criteria, use theirs and add only what the
  problem needs that theirs miss.

Keep the criteria from every sketcher. A sketcher that sees them writes to them, and then the scores
can't tell the sketches apart. Keep the requirements you give the sketchers to behaviour, so no
criterion slips in as a requirement.

## Sketches

Start every subagent in one message, with your harness's general agent type (`general-purpose` in
Claude Code) and `model: "sonnet"`. Never use a fork: it inherits this conversation, including the
criteria.

Give each one:

- the absolute path of [sketcher.md](./references/sketcher.md), and the instruction to read that
  file first;
- the problem and its requirements, word for word the same for every subagent;
- the paths of the code it touches, or the note that this is a design from scratch;
- its own folder in your scratch directory;
- its lens.

The lenses:

1. **The user's design.** Paste the user's design as they gave it, and the instruction to transcribe
   it, as [sketcher.md](./references/sketcher.md) says under "Transcribing the user's design".
2. **The smallest design that meets the requirements.**
3. **The design easiest to extend for the next likely need.**
4. **The design that follows the nearest existing pattern in the repo.** Add this lens only when
   there is a repo with such a pattern and the user's design doesn't already follow it. Leave it out
   for a code challenge from scratch.

## Compare

When every subagent has returned, read each sketch's reply, and compare what each one takes the
problem to be: which requirements it meets, and how it reads each one.

- **The sketches read the problem differently,** such as one treating a requirement as a hard limit
  and another as a preference: the problem isn't clear yet. Skip the judge, and report what they
  disagree about, with no pick. When the user's design is the one that reads it differently, say so
  plainly: that is often the most useful thing the bake-off finds.
- **They read it the same way:** go on to the judge. When two lenses also land on the same design,
  that's strong evidence for it: say so in the report.

## Judge

Copy each sketch's files into a new folder in your scratch directory named A, B, C (and D), in
shuffled order, and note which letter is which lens. Then make the sketches anonymous:

- Delete every comment that names a lens, an approach, the user, or a subagent.
- Delete any "Considered" or "Costs" notes inside the files. Those belong in the subagents' replies,
  which the judge never reads.
- Read the four sets of files side by side, and even out anything else that marks one as different,
  such as one sketch with a `03-flow` file the problem doesn't need.

Send the judge what [judge.md](./references/judge.md) says. While it works, read every sketch whole.
You know which one is the user's, so your own read isn't blind: use it to find faults the judge
missed, not to score.

## Pick and graft

Add up the judge's scores per sketch, and pick the highest total. When two totals tie, pick the one
easier to extend without breaking what it guarantees, then the one with the smaller interface.

When your own read shows a concrete fault the judge missed, such as a requirement a sketch fails,
don't quietly change the pick. Report the fault and the pick you would make instead, and let the
user decide.

Then graft. For each criterion, look at which sketch the judge scored highest on it. When that isn't
the pick, take the part of that sketch that earned the score, and rewrite it to fit the pick's
design. Graft only a part that keeps working inside the pick: a part that needs the other sketch's
whole structure isn't a graft. When you find yourself grafting more than two or three parts, the
pick is probably wrong: say so in the report.

Write the grafted design as its own sketch, in a folder named `final`, with the same files as the
others (`01-usage`, `02-types`, and `03-flow` when needed). Mark each grafted part with a comment
naming the sketch it came from.

## Show the result

Load the [show-me](../show-me/SKILL.md) skill, and build the message it describes:

1. The base frame: the current system, or, for a design from scratch, the shape the problem implies
   (the inputs, the outputs, and who calls what).
2. Each sketch drawn on that base frame, with its `01-usage` code and its key types from `02-types`
   under the drawing. Label each one by its lens, and the user's as "Your design".
3. The score table: a row per criterion, a column per sketch, and a totals row. Each cell is the
   judge's score, then any red flag it found.
4. **Your design against the rest:** for each criterion where the user's design didn't score
   highest, one line on what the winning sketch did there that the user's didn't, with the judge's
   reason.
5. The final grafted design, drawn on the same base frame, with its `01-usage` and `02-types`, and
   each graft marked with `✓` and the sketch it came from.
6. Any fault you found that the judge missed, and the pick you would make instead.
7. One question: whether the user takes the final design, or wants a different pick.

Then, after the question, the full report:

- **The sketches:** every file of each sketch and of `final`, in full, in a `<details>` block per
  sketch, because you delete the scratch directory when you're done.
- **The subagents' replies:** the "Considered" and "Costs" of each, in the same `<details>` blocks.
- **The judge's reasons,** per score.
- **Who judged:** the judge's model, and whether it came from another model family or from Claude.

When the sketches read the problem differently, the message holds the base frame, each sketch on
it, and what they disagree about, with no scores, no pick and no graft.

**Reply:** the show-me message, ending in its one question, then the full report.

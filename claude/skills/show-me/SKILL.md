---
name: show-me
description:
  'Shows the user a system, a choice or a change in one chat message: box-drawing diagrams built up
  one part at a time, each option drawn on the same base frame of the current system, caller-first
  code, a trade-off table, and the recommendation just before one question. Load it before you
  explain where a system stands, lay out options for a decision, show the shape of a structure, or
  show a before and after.'
---

# Show me

Build one chat message that shows the user what they need to see before they act: where a system
stands, the options for a decision, the shape of a structure, or a change before and after. Hand
back the message, ending in one question when it asks for a decision.

Build each diagram as a series of frames, one drawing each, and add one part in each frame, so the
user sees which part matters. Draw every option on the base frame, the last frame of the current
system, so the user sees what moved. Give your recommendation after the options, so the user weighs
each option before seeing your pick. Ask in the message itself: a tool that asks the question in a
dialog can hide the message.

## Key rules

- [When to draw a diagram](#when-to-draw-a-diagram): grounding, options, a shape, or a before and
  after; not for a fact or a yes-or-no answer.
- [Build a diagram one part at a time](#build-a-diagram-one-part-at-a-time): frames, one new part in
  each, a line above each on what it adds, and no line over 100 characters.
- [Draw each option on the base frame](#draw-each-option-on-the-base-frame): the same layout, with
  the point where the option fails marked.
- [Show code from the caller](#show-code-from-the-caller): the call site first, then each new
  structure.
- [Compare in a table](#compare-in-a-table): one column per option, each row phrased so `✓` is good.
- [Show the source](#show-the-source): the lines the choice rests on, in a code block or a quote,
  never only a file and line.
- [Order the message](#order-the-message): the options first, then your recommendation, then one
  question.
- [Where it goes](#where-it-goes): in the chat.

## References

- [A decision message](./references/decision-message.md): a worked example of a message that asks
  the user to choose between options.

## When to draw a diagram

Draw a diagram for one of these four tasks:

- **Grounding:** the system as it is now, before you propose a change, so you and the user start
  from the same base frame.
- **Options for a decision:** each option drawn on the base frame.
- **A shape:** a pipeline, a state machine, a table and its relations, the processes and how they
  call or message each other.
- **Before and after:** the system now, then the system with the change.

Answer anything else in words. A fact, a status line, or a yes-or-no answer to a factual question
needs no diagram. Draw one for a choice between options that change the system's shape, even when
the user asked it as a yes or no.

## Build a diagram one part at a time

A diagram is a series of frames. A frame is one drawing in box-drawing characters, in its own `text`
code block. Draw the first frame with the fewest parts that still show the system correctly, and add
one part in each frame after it. Above each frame, say in one line what it adds. That way the user
doesn't have to compare two frames part by part. Keep the build-up to about five frames. Option
frames don't count.

Add more than one part to a frame only for:

- two parts that make sense only together;
- an option frame, with all of that option's changes;
- the after frame of a before and after, with the whole change.

In a decision message, build the base frame up inside the message only when the conversation holds
no drawing of this system yet. Otherwise show it once, as a single frame.

````markdown
A user publishes a recipe through the API:

```text
┌──────┐  publish   ┌─────┐
│ user │ ─────────▶ │ API │
└──────┘            └─────┘
```

The API stores the recipe:

```text
┌──────┐  publish   ┌─────┐
│ user │ ─────────▶ │ API │
└──────┘            └─────┘
                       │
                       ▼
                   ┌──────┐
                   │  db  │  recipe row
                   └──────┘
```
````

- **Names.** Use the names the code and the conversation already use, so the user can find each
  part.
- **Width.** Keep every line of a frame within 100 characters, indentation included. A terminal
  wraps a wider line and breaks the boxes. When a frame is too wide, put its widest row of boxes on
  two rows, or split the frame in two at a natural break, such as a queue.
- **Marks.** On any frame, `✓` marks what holds and `✗` marks what fails, each with a few words that
  say what.

## Draw each option on the base frame

The base frame is the last frame of the current system. Draw each option as one frame: the base
frame, in the same layout, with all of that option's changes. Mark the point where the option fails
with `✗`, next to the part that breaks, such as the part that loses data in a crash. Mark what holds
with `✓` too, such as its main strength. A cost with no place in the drawing, such as effort, goes
in the table instead. The user compares options by what moved. A new layout hides the difference.

## Show code from the caller

When the options differ in code, show the call site first. The user judges an option by its code
there. Then show each new structure the option adds, such as a table or a type. Leave out every line
that is the same in all the options. When every option needs a new function that the code has no
name for yet, give that function the same invented name in every option. When the call site is the
same in every option, show no code.

## Compare in a table

Put the trade-offs in a table: one column per option, and one row per property the decision turns
on. Phrase each row so that `✓` is good, as in the frames. Write "Publish returns at once" in place
of "Publish waits for retries". Give a figure where you have one, such as a time, a count or an
effort in hours. Your own estimate counts: write "about" in front of it. Leave out a row where every
option is the same.

## Show the source

When a choice rests on code, a doc or a rule, show the lines themselves, so the user can check the
claim without opening a file:

- **Code:** the few lines that matter, in a code block tagged with its language, with the file's
  path in the sentence above it.
- **A doc or a rule:** the sentence, as a quote, with the doc's path.

A file and line number alone isn't enough. The user won't open the file.

## Order the message

A message that asks for a decision goes in this order:

1. The decision, in one line.
2. Where the system is now: the base frame, and the fact that makes the decision necessary.
3. Each option the user could pick: its frame, then its code.
4. The trade-off table.
5. Each option a rule or a hard limit rules out, in one line, with the rule or the limit.
6. Your recommendation and what it costs, in two or three sentences.
7. One question, with the choices named, so the user can answer in a word.

Put each quote from [Show the source](#show-the-source) next to the claim it supports, such as in
step 2 or step 5. Put the recommendation after the options, so the user weighs each option before
they see your pick. Put it just before the question, so the user answers with your reason in view.

Put one decision in a message, so the user answers each on its own, and a later decision can build
on the answer. When there are several, number them ("Decision 2 of 4"), and send the next one after
the user answers. When an answer adds or removes a decision, change the total. Draw the next base
frame with the earlier answers in it.

A message for grounding, a shape, or a before and after holds the frames, each with the line above
it that says what it adds. End it with a question only when you need an answer.

## Where it goes

Put the message in the chat, where the user reads it beside the question it ends with. Don't publish
it as a page or a doc.

**Reply:** the message, ending in one question when it asks for a decision.

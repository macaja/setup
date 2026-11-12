# Design red flags

You judge a bake-off: three or four sketches of one design, each written by a subagent from a different
approach. Each sketch holds the calling code, the design's types and signatures, and stubs for most
function bodies. A red flag is a design choice that will mislead whichever agent later builds on the
design. That builder sees only the files it opened, copies the nearest example, and takes the
shortest path that compiles.

You score each sketch from 1 to 5 on each criterion you were given, in a score table with a row per
criterion and a column per sketch. Score each cell on your own judgment first. Then check each
sketch for each red flag in the list below. Judge only what a sketch can show: a stub, or a missing
config file, isn't a red flag.

For each red flag you find:

1. Pick each criterion the red flag works against, such as a criterion about adding a feature for a
   pass-through method.
2. Lower the sketch's score on each of those criteria by one point, to no lower than 1.
3. Write the red flag's name in each cell you lowered.

Count each red flag once per sketch, however often it appears. When one choice matches two red
flags, count only the closer one. When a choice would mislead the builder and isn't in the list,
count it as a red flag too, and give it a short name, such as "A shallow module".

| Red flag                       | How to spot it in a sketch                                                                                                | How it misleads the builder                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A shallow module               | The usage calls several of the module's methods in a set order to do one thing, or passes options that name its steps.    | The builder has to learn the module's internals to use it, and gets the order wrong.             |
| Leaked detail                  | Two modules' signatures take the same database row or network payload, such as a JSON body, rather than a domain type.    | A change to that type means edits in every module, and the builder edits only the one it opened. |
| Modules split by when they run | Separate modules load, check and save the same data, one module per step.                                                 | The builder adds a rule to one step's module, and the other steps keep the old rule.             |
| A pass-through method          | A method takes the same parameters and returns the same type as the one it calls, with no rule or translation of its own. | The builder adds the next feature to the pass-through, not the layer that owns the rule.         |
| Split ownership                | More than one module has a function, such as `save*` or `update*`, that writes the same state.                            | The builder edits one writer, can't see the others, and their rules drift apart.                 |
| Two ways to do one task        | The sketch exports two entry points that do the same job.                                                                 | The builder copies whichever it finds first, so both keep gaining callers.                       |
| Reachable internals            | A public entry file re-exports internals.                                                                                 | The builder imports them, and they become part of the interface.                                 |
| A hand-synced list             | Two places list the same items, with no step that derives one from the other.                                             | The builder adds an item to the list it found, and the other list misses it.                     |

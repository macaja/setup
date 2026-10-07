export const meta = {
  name: 'build-feature',
  description:
    'Implement an agreed feature plan: sonnet builds on a worktree branch, opus reviews the diff, a PR opens once clean, the CodeRabbit review gets triaged and fixed, haiku watches CI, with bounded fix loops at each gate',
  whenToUse:
    'After a feature plan has been agreed interactively. Pass args: { plan: string, branch: string, size?: "small" | "normal", issue?: number, prNumber?: number, verifyCommands?: string[], testingStandard?: string, base?: string, worktree?: string }. size="small" is for a plan of a few files: sonnet reviews regardless of diff size, one fix round per gate. After the PR opens, the run waits for the one CodeRabbit review (up to about 30 minutes), opus triages its comments, and sonnet fixes the real ones in a single push; a PR CodeRabbit never reviews moves straight on to CI. prNumber points at an existing PR to push to and mark ready instead of creating one; base is the branch the PR targets and the diff/rebase reference (default main) — pass it for a stacked PR; worktree overrides the checkout path (default .worktrees/<branch>) — pass an absolute path when the session already runs inside the worktree; before implementing, the preflight fetches origin/<base> and merges it into the branch (creating the worktree from origin/<base> when missing), and the run stops if the worktree has uncommitted changes or the merge conflicts; verifyCommands are extra whole-repo gates the implementer must pass for cross-cutting work. testingStandard is the verbatim text of the Pipelabs testing guidelines — read /tmp/pipelabs-docs/guidelines/testing/README.md, writing-tests.md and test-data.md (plus database.md or frontend.md when the work touches them) and pass their concatenated contents whenever the work adds or changes tests, because a workflow script cannot read files itself and an agent handed a path may decide it already knows the rules. A run cannot pause for conversation — bake every decision it will need into the plan, or split multi-decision phases into separate runs. Returns the PR URL on success or a failure report with the branch left in place for inspection.',
  phases: [
    {
      title: 'Preflight',
      detail:
        'haiku (low effort) refreshes the Pipelabs guidelines clone that later stages read, fetches the base branch from origin and merges it into the worktree branch (creating the worktree from origin when missing)',
      model: 'haiku',
    },
    {
      title: 'Implement',
      detail: 'sonnet (medium effort) implements the plan in a worktree',
      model: 'sonnet',
    },
    {
      title: 'Review',
      detail:
        'sonnet reviews small diffs, opus reviews large ones (medium effort); sonnet (medium effort) fixes blocking findings (max 2 rounds, 1 when size=small)',
    },
    {
      title: 'Open PR',
      detail:
        'sonnet (medium effort) rebases onto the base branch, pushes, opens (or readies) the PR',
      model: 'sonnet',
    },
    {
      title: 'CodeRabbit',
      detail:
        'haiku (low effort) waits for the one review; opus (medium effort) triages findings; sonnet (medium effort) fixes real ones in one push',
      model: 'haiku',
    },
    {
      title: 'Watch CI',
      detail:
        'haiku (low effort) watches checks; sonnet (medium effort) fixes red CI (max 2 rounds)',
      model: 'haiku',
    },
  ],
};

const OPUS_REVIEW_LINE_THRESHOLD = 200;
const OPUS_REVIEW_FILE_THRESHOLD = 6;

const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;

if (!parsedArgs || !parsedArgs.plan || !parsedArgs.branch) {
  throw new Error(
    'build-feature requires args: { plan: string, branch: string, size?: "small" | "normal", issue?: number, prNumber?: number, verifyCommands?: string[], testingStandard?: string, base?: string, worktree?: string }',
  );
}

const { plan, branch, size, issue, prNumber, verifyCommands, testingStandard } =
  parsedArgs;
const base = parsedArgs.base || 'main';
// The local base branch can lag origin by any number of merges, so every diff
// and branch point uses the remote-tracking ref the preflight just fetched.
const baseRef = `origin/${base}`;
const worktree = parsedArgs.worktree || `.worktrees/${branch}`;
const SMALL = size === 'small';
const MAX_FIX_ROUNDS = SMALL ? 1 : 2;

const GUIDELINES_DIR = '/tmp/pipelabs-docs/guidelines';
const GUIDELINES_REFRESH = `git -C /tmp/pipelabs-docs pull --quiet 2>/dev/null || git clone --quiet --depth 1 git@github.com:pipelabs/docs.git /tmp/pipelabs-docs`;

const PREFLIGHT_SCHEMA = {
  type: 'object',
  required: ['available'],
  properties: {
    available: {
      type: 'boolean',
      description: 'True when the testing guidelines are readable on disk',
    },
    reason: {
      type: 'string',
      description: 'Only when available=false: what failed',
    },
  },
};

/**
 * The Pipelabs testing standard lives in a separate docs repo, not in this
 * repo and not in the skill that points at it. Subagents cannot invoke skills,
 * so the fetch happens once here and every later prompt gets the resolved
 * paths instead of an instruction to go find them.
 */
phase('Preflight');
const guidelines = await agent(
  `Run this from the repo root, then verify the result:

\`\`\`bash
${GUIDELINES_REFRESH}
\`\`\`

Then confirm ${GUIDELINES_DIR}/testing/README.md exists and is non-empty. Return available=true only if it does. Do not read or summarise the contents; later agents read them directly. Change nothing else on disk.`,
  {
    label: 'fetch-guidelines',
    model: 'haiku',
    effort: 'low',
    schema: PREFLIGHT_SCHEMA,
    phase: 'Preflight',
  },
);

if (!guidelines || !guidelines.available) {
  log(
    `Testing guidelines unavailable (${guidelines ? guidelines.reason : 'preflight agent died'}) — later stages fall back to AGENTS.md alone`,
  );
}

const SYNC_SCHEMA = {
  type: 'object',
  required: ['status'],
  properties: {
    status: {
      enum: ['created', 'up-to-date', 'merged', 'conflict', 'dirty', 'failed'],
    },
    reason: {
      type: 'string',
      description:
        'For conflict, dirty or failed: what happened, with the conflicting or uncommitted paths',
    },
  },
};

const sync = await agent(
  `Bring the feature branch's worktree up to date with ${baseRef} before any work starts. Run each step from the repo root and stop at the first one that fails.

1. \`git fetch origin ${base}\`. If it fails, return status=failed with the error.
2. If ${worktree} is not an existing worktree:
   - when the branch ${branch} does not exist locally: \`git worktree add --no-track -b ${branch} ${worktree} ${baseRef}\`, then return status=created;
   - when it exists: \`git worktree add ${worktree} ${branch}\` and continue with step 3.
3. \`git -C ${worktree} status --porcelain\`. If it prints anything, return status=dirty with the paths and change nothing.
4. \`git -C ${worktree} merge-base --is-ancestor ${baseRef} HEAD\` exits 0 when the branch already contains ${baseRef}: return status=up-to-date.
5. \`git -C ${worktree} merge --no-edit ${baseRef}\`. If it stops on conflicts, run \`git -C ${worktree} merge --abort\` and return status=conflict with the conflicting paths. Otherwise return status=merged.

Never rebase, reset, push, or delete anything. Do not resolve conflicts yourself.`,
  {
    label: 'sync-base',
    model: 'haiku',
    effort: 'low',
    schema: SYNC_SCHEMA,
    phase: 'Preflight',
  },
);

if (!sync || !['created', 'up-to-date', 'merged'].includes(sync.status)) {
  return {
    status: 'failed',
    stage: 'preflight',
    branch,
    worktree,
    reason: sync
      ? `could not bring ${branch} up to date with ${baseRef} (${sync.status}): ${sync.reason || 'no detail'}`
      : 'sync agent died',
  };
}
log(`Worktree ${sync.status} against ${baseRef}`);

const STANDARD_TEXT =
  typeof testingStandard === 'string' && testingStandard.trim()
    ? testingStandard.trim()
    : '';

/**
 * The caller can hand over the standard's text, and when it does that text is
 * pasted in rather than pointed at. A path in a prompt is an instruction the
 * model may conclude it already knows; text in the prompt is unavoidable. The
 * pointer form stays as the fallback for runs launched without it.
 */
const TESTING_SOURCE = STANDARD_TEXT
  ? `- The standard's full text is reproduced at the end of these rules, between <testing-standard> markers. Judge your tests against that text and nothing else; the tests already in this repo predate the standard and are not the benchmark. Read ${GUIDELINES_DIR}/testing/ for the topic docs it does not include — boundary-mocking.md (MSW, SDK, filesystem), database.md (backend tests on a real database), frontend.md (React components and hooks) — whichever the work touches.`
  : `- Before writing or changing ANY test file, read ${GUIDELINES_DIR}/testing/README.md, then ${GUIDELINES_DIR}/testing/writing-tests.md, then ${GUIDELINES_DIR}/testing/test-data.md. Those three are mandatory for every test file, because every test constructs data. Then read whichever of these the work also touches: boundary-mocking.md (MSW, SDK, filesystem), database.md (backend tests on a real database), frontend.md (React components and hooks). All in ${GUIDELINES_DIR}/testing/.`;

/**
 * Appended to the repo ground rules when either the text arrived in args or
 * the clone succeeded, so agents are never sent to read paths that are not
 * there.
 */
const TESTING_RULES =
  STANDARD_TEXT || (guidelines && guidelines.available)
    ? `
Testing standard — AGENTS.md tells you to invoke a \`testing\` skill for this; you have no skill tool, and this is what that skill resolves to. It is binding, and it is the standard AGENTS.md's own testing section layers on top of:
${TESTING_SOURCE}
- The rules broken most often, so check them explicitly before you commit: flat \`test()\` only — \`describe\` and \`it\` are banned; per-test setup in a local \`setupTest()\` function, never \`beforeEach\` in a test file; \`toStrictEqual\` for structural assertions; mock at the boundary (the network, the filesystem, an SDK's command layer) and never \`fetch\`, \`axios\`, or one of our own methods.
- Data construction is the half of the standard that gets skipped, so check it just as explicitly. A per-suite helper that builds a scenario — \`setUpModelWithAxes\`, \`buildRequestForViewer\`, anything shaped like it — is a violation whatever it is named. The only per-file setup function is \`setupTest()\`, and it builds the environment (the ability to create entities, authenticate a viewer, make a request), never the scenario. The scenario goes inline in each test body, repetition and all: verbose beats DRY here, and hidden setup is the real smell. A reusable builder is allowed only when it names a domain concept two engineers would scope identically, and then it lives in the project's shared factories/composites directory with its own test file, not beside one suite. Module-level fixture constants shared across tests are banned for the same reason.
- Test names follow verb + outcome + when/for + condition, with \`#methodName\` prefixing a service-method test and \`[GET](/path)\` prefixing an endpoint test. Match the wording of the titles already in the file you are editing; a file whose titles drift between styles is a finding.
- Write test titles in plain everyday language. No reviewer jargon and no shorthand a reader would have to decode.
- AGENTS.md's "Testing Standards" section names this repo's own machinery (\`@pd4castr/server/test-utils\`, \`@pd4castr/mock-api\`, \`createTestDB\` isolation, \`MockedPartial\`). Where the two overlap, follow AGENTS.md — it knows the local helpers.
${STANDARD_TEXT ? `\n<testing-standard>\n${STANDARD_TEXT}\n</testing-standard>\n` : ''}`
    : '';

/**
 * Ground rules every agent that touches the repo must follow. Prepended to
 * each mutating prompt so fixer agents in later phases inherit the same
 * constraints as the implementer. The testing standard is appended only for
 * the agents that write or restructure tests; it is the largest block in any
 * prompt here and the CI fixer never needs it.
 */
const REPO_RULES = `
Ground rules for working in this repo:
- Read AGENTS.md at the repo root before writing any code; its conventions (module order, function-name prefixes, testing rules, one-export-per-file, no non-null assertions, no type casts) are binding.
- Work ONLY inside the worktree at ${worktree}. Never commit on main or on ${base}.
- The worktree is a separate checkout: run \`pnpm install\` inside it first before running anything.
- Node is pinned via Volta (24.x). Run all commands through the repo's toolchain; do not switch Node versions.
- Git hooks are lefthook — read lefthook.yml at the repo root for what each hook gates (pre-commit: lint/format/secrets on staged; pre-push: lint, format:check, typecheck, type-aware lint). NEVER bypass hooks with --no-verify or by editing hook files. If a hook fails, fix the cause and re-commit.
- Use relative paths from the repo root in tool calls.
- Every turn re-sends your whole context, so the number of turns is the dominant cost of this run. Batch independent tool calls into one turn: issue the reads, greps and searches you already know you need as parallel tool calls, and read a file once, in full, with the Read tool instead of slicing it across several sed/head/grep calls.
- If your changed tests touch Postgres, start the test database first from the repo root: \`docker compose -f docker-compose.test.yml up -d\` (test Postgres listens on host port 5999).
- Run tests with \`pnpm test <files>\` from the repo root, naming only the test files your change affects, every time you run them while fixing. Run a broad suite (a whole workspace, with \`--maxWorkers=4\`) only as a final check before your last commit, or when a verify command you were given requires it, never while iterating. Never run \`pnpm vitest\` directly.
- If the same tests still fail after three fix attempts in a row, stop: return status=blocked with the failing test names, the decisive error lines, and what you tried. Do not keep iterating.
- Use Conventional Commits with a scope from the AGENTS.md scope list (one per workspace, e.g. \`feat(app): …\`, \`fix(api): …\`); omit the scope only when a change legitimately spans multiple workspaces.${issue ? ` Reference issue #${issue} in the PR body (Closes #${issue}), not in the commit scope.` : ''}
`;

const REPO_RULES_WITH_TESTING = `${REPO_RULES}${TESTING_RULES}`;

const IMPLEMENT_SCHEMA = {
  type: 'object',
  required: ['status', 'summary', 'commits'],
  properties: {
    status: { enum: ['done', 'blocked'] },
    summary: {
      type: 'string',
      description: 'What was built, at PR-description altitude',
    },
    commits: {
      type: 'array',
      items: { type: 'string' },
      description: 'Commit subjects created',
    },
    blockedReason: {
      type: 'string',
      description:
        'Only when status=blocked: what stopped progress and what is needed',
    },
  },
};

const FIX_SCHEMA = {
  type: 'object',
  required: ['status', 'summary'],
  properties: {
    status: { enum: ['done', 'blocked'] },
    summary: { type: 'string' },
    blockedReason: { type: 'string' },
    resolvedConflicts: {
      type: 'boolean',
      description:
        'True when the fix involved resolving merge/rebase conflicts by hand',
    },
  },
};

const PR_SCHEMA = {
  type: 'object',
  required: ['url', 'number', 'resolvedConflicts'],
  properties: {
    url: { type: 'string' },
    number: { type: 'integer' },
    resolvedConflicts: {
      type: 'boolean',
      description:
        'True when the rebase onto the base branch hit conflicts that were resolved by hand',
    },
  },
};

const DIFF_STATS_SCHEMA = {
  type: 'object',
  required: ['filesChanged', 'linesChanged'],
  properties: {
    filesChanged: { type: 'integer' },
    linesChanged: {
      type: 'integer',
      description: 'insertions + deletions from git diff --shortstat',
    },
  },
};

const CODERABBIT_WAIT_SCHEMA = {
  type: 'object',
  required: ['status'],
  properties: {
    status: {
      enum: ['reviewed', 'no-review'],
      description:
        'no-review when CodeRabbit skipped the PR, is not installed, or did not post within the wait',
    },
    reason: { type: 'string', description: 'Only for no-review: why' },
    reviewBody: {
      type: 'string',
      description:
        "The review's own body, verbatim: CodeRabbit puts nitpicks and outside-the-diff comments there",
    },
    comments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'body'],
        properties: {
          path: { type: 'string' },
          line: { type: 'integer' },
          body: { type: 'string', description: 'The comment body, verbatim' },
        },
      },
    },
  },
};

const CODERABBIT_FINDING = {
  type: 'object',
  required: ['location', 'summary'],
  properties: {
    location: { type: 'string', description: 'file:line' },
    summary: { type: 'string' },
    fix: {
      type: 'string',
      description: 'Only for real findings: what to change',
    },
    reason: {
      type: 'string',
      description:
        'Only for dismissed findings: what in the code or the plan makes it wrong or out of scope',
    },
  },
};

const CODERABBIT_TRIAGE_SCHEMA = {
  type: 'object',
  required: ['real', 'dismissed'],
  properties: {
    real: { type: 'array', items: CODERABBIT_FINDING },
    dismissed: { type: 'array', items: CODERABBIT_FINDING },
  },
};

const CI_SCHEMA = {
  type: 'object',
  required: ['conclusion', 'failures'],
  properties: {
    conclusion: { enum: ['green', 'red'] },
    failures: {
      type: 'array',
      items: {
        type: 'object',
        required: ['check', 'summary'],
        properties: {
          check: { type: 'string' },
          summary: { type: 'string' },
          logExcerpt: {
            type: 'string',
            description: 'The decisive lines from the failing log',
          },
        },
      },
    },
  },
};

phase('Implement');
const verifyGate =
  verifyCommands && verifyCommands.length > 0
    ? `\nThe affected-scope gates above miss cross-cutting breakage. Before your final commit, additionally run each of these from the repo root and get it green:\n${verifyCommands.map((c) => `- \`${c}\``).join('\n')}\n`
    : '';
const impl = await agent(
  `You are implementing a feature that has already been planned and agreed. Follow the plan; do not redesign it. If the plan is wrong in a way you cannot resolve locally, stop and return status=blocked with the reason rather than improvising a different design.
${REPO_RULES_WITH_TESTING}
Setup: the worktree at ${worktree} already exists and already contains ${baseRef}. Do not recreate it, rebase it, or merge into it. Run \`pnpm install\` inside it.

The plan:

${plan}

If the plan above is only a pointer to a file, read that file once, in full, before you start, and work from that reading instead of opening it again.

Implement the plan completely, including tests for new behaviour written to the testing standard in the ground rules above. Commit in logical increments. Pre-commit only auto-fixes lint/format on staged files — it proves nothing about types or behaviour. Before your final commit, run \`pnpm typecheck\` and \`pnpm test <the files your change affects>\` from the repo root and get both green: pre-push and CI gate them anyway, but later stages expect a branch that already passes.
${verifyGate}
Do not push and do not open a PR; later stages handle that.`,
  {
    label: 'implement',
    model: 'sonnet',
    effort: 'medium',
    schema: IMPLEMENT_SCHEMA,
  },
);

if (!impl)
  return {
    status: 'failed',
    stage: 'implement',
    branch,
    worktree,
    reason: 'implementer agent died or was skipped',
  };
if (impl.status === 'blocked') {
  return {
    status: 'blocked',
    stage: 'implement',
    branch,
    worktree,
    reason: impl.blockedReason,
  };
}
log(`Implemented: ${impl.summary}`);

const diffStats = await agent(
  `Run these two commands and report the numbers; do nothing else.

1. \`git -C ${worktree} diff --shortstat ${baseRef}...HEAD\` → linesChanged is insertions+deletions from the summary line (0 if a number is absent).
2. \`git -C ${worktree} diff --name-only ${baseRef}...HEAD\` → filesChanged is the count of names.`,
  {
    label: 'diff-stats',
    model: 'haiku',
    effort: 'low',
    schema: DIFF_STATS_SCHEMA,
  },
);
const reviewerModel =
  !SMALL &&
  diffStats &&
  (diffStats.linesChanged > OPUS_REVIEW_LINE_THRESHOLD ||
    diffStats.filesChanged > OPUS_REVIEW_FILE_THRESHOLD)
    ? 'opus'
    : 'sonnet';
log(
  `Diff: ${diffStats ? `${diffStats.filesChanged} files, ${diffStats.linesChanged} lines` : 'stats unavailable'} — reviewer: ${reviewerModel}${SMALL ? ' (size=small)' : ''}`,
);

const STANDARD_AVAILABLE = Boolean(
  STANDARD_TEXT || (guidelines && guidelines.available),
);

phase('Review');
/**
 * With no separate test audit, the reviewer owns the testing standard too.
 * A standard violation is blocking here, so it cannot be graded away as minor
 * next to correctness findings.
 */
const reviewTestingDimension = STANDARD_AVAILABLE
  ? `
The test code the branch adds or changes must follow the Pipelabs testing standard: flat \`test()\`, \`setupTest()\` building the environment and never the scenario, data built inline in each test, the standard's title form, mocks at the boundary. Every deviation in that code is blocking. Tests that predate the branch are out of scope, even when they break the standard. ${
      STANDARD_TEXT
        ? `The standard is reproduced below; judge against it, not against the tests already in the repo.

<testing-standard>
${STANDARD_TEXT}
</testing-standard>`
        : `Read ${GUIDELINES_DIR}/testing/README.md, writing-tests.md and test-data.md before judging test code, and judge against them, not against the tests already in the repo.`
    }
`
  : '';

const reviewPreamble = `You are reviewing an unpushed feature branch before it becomes a PR. Repo root is the current directory; the branch lives in the worktree at ${worktree}. Read AGENTS.md first — its conventions are binding and convention violations that tooling cannot catch are in scope.

Review the full diff (\`git -C ${worktree} diff ${baseRef}...HEAD\`) and read surrounding source where the diff alone is ambiguous. The plan this branch implements:

${plan}
${reviewTestingDimension}
Classify each finding:
- blocking: correctness bugs, broken or missing tests for new behaviour, tests that pass whether or not the code works, testing-standard deviations in the branch's test code, deviations from the plan, security problems, AGENTS.md violations that hooks/CI will not catch.
- minor: real but non-blocking improvements. Report them; they will be surfaced to the human reviewer, not fixed here.
Do not modify any files. No praise, no restating the diff.`;

const reviewFixPreamble = `A reviewer found blocking problems on the feature branch in the worktree at ${worktree}. Fix exactly these findings — no drive-by refactors:
${REPO_RULES_WITH_TESTING}
The plan the branch implements, for context:

${plan}

Commit the fixes (hooks must pass). Do not push.

The blocking findings to fix:`;

// Delegate the review→fix→re-review loop to the shared review-loop workflow
// (also driven by review-pr for submitted PRs). Reviewer tier is gated on
// diff size above; sonnet fixes either way.
const reviewResult = await workflow('review-loop', {
  reviewPreamble,
  fixPreamble: reviewFixPreamble,
  reviewerModel,
  fixerModel: 'sonnet',
  reviewerEffort: 'medium',
  fixerEffort: 'medium',
  rounds: MAX_FIX_ROUNDS,
  phaseLabel: 'Review',
});

if (reviewResult.status === 'agent-died')
  return {
    status: 'failed',
    stage: 'review',
    branch,
    worktree,
    reason: reviewResult.reason,
  };
if (reviewResult.status === 'fix-blocked')
  return {
    status: 'blocked',
    stage: 'review-fix',
    branch,
    worktree,
    reason: reviewResult.reason,
    outstandingFindings: reviewResult.blocking,
  };
if (reviewResult.status === 'blocking-remaining')
  return {
    status: 'review-blocked',
    branch,
    worktree,
    reason: `blocking findings remain after ${MAX_FIX_ROUNDS} fix rounds`,
    outstandingFindings: reviewResult.blocking,
    minorFindings: reviewResult.minorFindings,
  };

const minorFindings = reviewResult.minorFindings.slice();
log(`Review clean (${minorFindings.length} minor finding(s) noted)`);

phase('Open PR');
const prBodySpec = `Write the PR body from the branch's actual final diff (\`git -C ${worktree} diff ${baseRef}...HEAD\`) — do not paraphrase second-hand summaries — following the repo template (.github/pull_request_template.md): condensed description (lead ≤2 sentences, one-line bullets, ≤150 words, no hard line wrapping), decisions a reviewer can't read off the diff, no narrative about review rounds or fix history${issue ? `, starting with \`Closes #${issue}\`` : ''}. For orientation only, the implementer summarized the work as: ${impl.summary}`;
const prAction = prNumber
  ? `Update the existing PR #${prNumber}: refresh its body with \`gh pr edit ${prNumber}\` and mark it ready for review with \`gh pr ready ${prNumber}\`. Return its URL and number.`
  : `Open the PR with \`gh pr create --head ${branch} --base ${base}\`, title in Conventional Commits form with a scope from the AGENTS.md scope list. Return the new PR's URL and number.`;
const prTemplateActions = `The repo's PR template carries instructions inside its HTML comments, and some of them are actions on the PR object — labels, reviewers, draft state — not text for the body. Read every comment in the template and satisfy all of them, whatever they turn out to be in this repo. Before returning, verify with \`gh pr view <number> --json labels,body\` that the PR actually carries what the template asked for.`;
const pr = await agent(
  `Publish the reviewed feature branch in the worktree at ${worktree} as a PR against ${base}.

1. Bring the branch up to date: \`git -C ${worktree} fetch origin\` then \`git -C ${worktree} rebase origin/${base}\`. If the rebase hits conflicts, resolve them faithfully to both sides' intent (rerun \`pnpm install\` in the worktree if dependency manifests changed) and return resolvedConflicts=true; if it was clean or a no-op, return resolvedConflicts=false.
2. Push with \`git -C ${worktree} push -u origin ${branch}\`, adding \`--force-with-lease\` only if the rebase rewrote commits that were already pushed.
3. ${prAction}

${prBodySpec}

${prTemplateActions}`,
  {
    label: prNumber ? 'ready-pr' : 'open-pr',
    model: 'sonnet',
    effort: 'medium',
    schema: PR_SCHEMA,
  },
);
if (!pr)
  return {
    status: 'failed',
    stage: 'open-pr',
    branch,
    worktree,
    reason: 'PR agent died or was skipped',
  };
let rebaseConflicts = Boolean(pr.resolvedConflicts);
log(`${prNumber ? 'PR readied' : 'PR opened'}: ${pr.url}`);

/**
 * CodeRabbit posts one review per PR on its own schedule. The run waits for
 * that one review only: the fix push below may draw an incremental review,
 * and nothing waits for it.
 */
phase('CodeRabbit');
let codeRabbit = null;
const crWait = await agent(
  `Wait for the CodeRabbit review on PR #${pr.number} in this repo, then collect it. CodeRabbit is the GitHub app whose login is \`coderabbitai[bot]\`.

Poll \`gh api repos/{owner}/{repo}/pulls/${pr.number}/reviews --paginate\` for a review by \`coderabbitai[bot]\`. Wait between polls inside one Bash command, for example a loop that checks every 60 seconds for up to 9 minutes, run with a 600000ms timeout, and rerun that loop until about 30 minutes have passed in total. Also read the PR's issue comments (\`gh api repos/{owner}/{repo}/issues/${pr.number}/comments\`): when CodeRabbit says there that it skipped or paused the review, or no CodeRabbit activity appears at all after 30 minutes, return status=no-review with the reason.

Once the review exists, return status=reviewed with its body verbatim as reviewBody, and every inline comment that belongs to it as comments: list them with \`gh api repos/{owner}/{repo}/pulls/${pr.number}/comments --paginate\` and keep those whose \`pull_request_review_id\` is that review's id. Copy bodies verbatim; do not summarise or judge them. Change nothing.`,
  {
    label: 'coderabbit-wait',
    model: 'haiku',
    effort: 'low',
    schema: CODERABBIT_WAIT_SCHEMA,
    phase: 'CodeRabbit',
  },
);

if (!crWait || crWait.status !== 'reviewed') {
  log(
    `No CodeRabbit review to act on (${crWait ? crWait.reason || 'no reason given' : 'wait agent died'}) — moving on to CI`,
  );
} else {
  const crTriage = await agent(
    `CodeRabbit reviewed PR #${pr.number}; the branch is checked out in the worktree at ${worktree}. Triage every finding in its review: the inline comments and anything in the review body (nitpicks, outside-the-diff comments, actionable items). Read AGENTS.md at the repo root first, and read the code each finding points at in the worktree before judging it.

- real: the problem exists in the code at HEAD and fixing it is in scope for this branch. Nitpicks count when they are right and cheap.
- dismissed: the finding is wrong about the code, conflicts with AGENTS.md or the plan, asks for work the plan leaves out, or targets code the branch did not touch. Say what makes it so.

The plan this branch implements:

${plan}

The review body:
${crWait.reviewBody || '(empty)'}

The inline comments:
${JSON.stringify(crWait.comments || [], null, 2)}

Do not modify any files.`,
    {
      label: 'coderabbit-triage',
      model: 'opus',
      effort: 'medium',
      schema: CODERABBIT_TRIAGE_SCHEMA,
      phase: 'CodeRabbit',
    },
  );

  if (!crTriage) {
    log('CodeRabbit triage did not complete — moving on to CI');
  } else if (crTriage.real.length === 0) {
    codeRabbit = { fixed: [], dismissed: crTriage.dismissed };
    log(
      `CodeRabbit: nothing to fix (${crTriage.dismissed.length} finding(s) dismissed)`,
    );
  } else {
    const crFix = await agent(
      `Fix these CodeRabbit findings on PR #${pr.number} (branch ${branch}, worktree at ${worktree}). Each was triaged as real; fix exactly these, no drive-by refactors.
${/\.(test|spec)\.|\btests?\b/i.test(JSON.stringify(crTriage.real)) ? REPO_RULES_WITH_TESTING : REPO_RULES}
Commit the fixes (hooks must pass), then push once to the existing branch without force: \`git -C ${worktree} push\`.

The findings:
${JSON.stringify(crTriage.real, null, 2)}`,
      {
        label: 'coderabbit-fix',
        model: 'sonnet',
        effort: 'medium',
        schema: FIX_SCHEMA,
        phase: 'CodeRabbit',
      },
    );
    if (!crFix || crFix.status === 'blocked') {
      return {
        status: 'blocked',
        stage: 'coderabbit-fix',
        branch,
        worktree,
        pr: pr.url,
        reason: crFix
          ? crFix.blockedReason
          : 'CodeRabbit fixer died or was skipped',
        outstandingFindings: crTriage.real,
        dismissedFindings: crTriage.dismissed,
        minorFindings,
        rebaseConflicts,
      };
    }
    codeRabbit = { fixed: crTriage.real, dismissed: crTriage.dismissed };
    log(
      `CodeRabbit: ${crTriage.real.length} fixed and pushed, ${crTriage.dismissed.length} dismissed`,
    );
  }
}

phase('Watch CI');
for (let round = 0; ; round++) {
  const ci = await agent(
    `Watch CI for PR #${pr.number} in this repo until every check completes. Run \`gh pr checks ${pr.number} --watch\` with a 600000ms timeout; if the command times out while checks are still pending, simply run it again — loop until it exits on its own.

If \`gh pr checks\` reports no checks at all (it can exit immediately), do NOT assume green: run \`gh pr view ${pr.number} --json mergeable,mergeStateStatus\`. If the PR is CONFLICTING, return conclusion=red with a single failures entry using check "merge-conflict" and what gh reported as the summary. If it is mergeable and checks simply have not started yet, wait briefly and watch again.

When all checks have completed: if everything passed, return conclusion=green with an empty failures array. If anything failed, pull the failing logs (\`gh run view <run-id> --log-failed\`, run ids via \`gh pr checks ${pr.number}\` / \`gh run list --branch ${branch}\`) and return one failures entry per failing check with the decisive log lines as the excerpt. Do not attempt any fixes.`,
    {
      label: `watch-ci-${round + 1}`,
      model: 'haiku',
      effort: 'low',
      schema: CI_SCHEMA,
      phase: 'Watch CI',
    },
  );
  if (!ci)
    return {
      status: 'failed',
      stage: 'watch-ci',
      branch,
      worktree,
      pr: pr.url,
      reason: 'CI watcher died or was skipped',
    };

  if (ci.conclusion === 'green') {
    return {
      status: 'ready',
      pr: pr.url,
      branch,
      worktree,
      summary: impl.summary,
      minorFindings,
      rebaseConflicts,
      codeRabbit,
    };
  }
  if (round >= MAX_FIX_ROUNDS) {
    return {
      status: 'ci-failed',
      pr: pr.url,
      branch,
      worktree,
      reason: `CI still red after ${MAX_FIX_ROUNDS} fix rounds`,
      failures: ci.failures,
      minorFindings,
      rebaseConflicts,
      codeRabbit,
    };
  }

  log(
    `CI red (${ci.failures.map((f) => f.check).join(', ')}), dispatching fixer (round ${round + 1})`,
  );
  const fix = await agent(
    `CI is failing on PR #${pr.number} (branch ${branch}, worktree at ${worktree}). Diagnose and fix these failures — reproduce locally where possible before changing code, and fix causes, not symptoms:
${REPO_RULES}
${JSON.stringify(ci.failures, null, 2)}

If a failure's check is "merge-conflict", the branch has fallen behind ${base}: \`git -C ${worktree} fetch origin\`, rebase onto origin/${base}, resolve conflicts faithfully to both sides' intent (rerun \`pnpm install\` in the worktree if dependency manifests changed), push with \`--force-with-lease\` — that flag is allowed for this case ONLY — and return resolvedConflicts=true if you resolved conflicts by hand.

For every other failure, commit the fixes (hooks must pass) and push to the existing branch without force.`,
    {
      label: `fix-ci-${round + 1}`,
      model: 'sonnet',
      effort: 'medium',
      schema: FIX_SCHEMA,
      phase: 'Watch CI',
    },
  );
  if (!fix || fix.status === 'blocked') {
    return {
      status: 'blocked',
      stage: 'ci-fix',
      branch,
      worktree,
      pr: pr.url,
      reason: fix ? fix.blockedReason : 'CI fixer died or was skipped',
      failures: ci.failures,
      minorFindings,
      rebaseConflicts,
      codeRabbit,
    };
  }
  if (fix.resolvedConflicts) rebaseConflicts = true;
}

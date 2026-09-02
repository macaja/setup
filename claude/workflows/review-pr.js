export const meta = {
  name: 'review-pr',
  description:
    'Review a submitted PR that already has human comments: sonnet reviews the diff and treats unresolved human review feedback as blocking, sonnet fixes the blocking findings and pushes to the PR branch, sonnet re-reviews — bounded to 2 rounds. Delegates the loop to the shared review-loop workflow.',
  whenToUse:
    'After a PR is opened and picked up review comments. Pass args: { prNumber: number, rounds?: number }. Reviews the PR diff plus the existing human comments, then commits and pushes fixes to the PR branch. Returns the final findings.',
  phases: [
    {
      title: 'Preflight',
      detail:
        'haiku (low effort) refreshes the Pipelabs guidelines clone that the reviewer and fixer read',
      model: 'haiku',
    },
    {
      title: 'Review',
      detail:
        'delegates to the review-loop workflow: sonnet (medium effort) reviews the PR diff + unresolved human comments, sonnet (medium effort) fixes blocking findings and pushes to the PR branch — up to `rounds` rounds (default 2)',
      model: 'sonnet',
    },
  ],
};

const a = typeof args === 'string' ? JSON.parse(args) : args;
if (!a || !a.prNumber) {
  throw new Error('review-pr requires args: { prNumber: number, rounds?: number }');
}
const { prNumber, rounds = 2 } = a;

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
    `Testing guidelines unavailable (${guidelines ? guidelines.reason : 'preflight agent died'}) — the review falls back to AGENTS.md alone`,
  );
}

const guidelinesAvailable = Boolean(guidelines && guidelines.available);

/**
 * Appended to the repo ground rules only when the clone succeeded, so agents
 * are never sent to read paths that are not there.
 */
const TESTING_RULES = guidelinesAvailable
  ? `
Testing standard — AGENTS.md tells you to invoke a \`testing\` skill for this; you have no skill tool, and these files are what that skill resolves to. They are binding, and they are the standard AGENTS.md's own testing section layers on top of:
- Before writing or changing ANY test file, read ${GUIDELINES_DIR}/testing/README.md, then ${GUIDELINES_DIR}/testing/writing-tests.md, then whichever of these the work touches: test-data.md (factories, composites), boundary-mocking.md (MSW, SDK, filesystem), database.md (backend tests on a real database), frontend.md (React components and hooks). All in ${GUIDELINES_DIR}/testing/.
- The rules broken most often, so check them explicitly before you commit: flat \`test()\` only — \`describe\` and \`it\` are banned; per-test setup in a local \`setupTest()\` function, never \`beforeEach\` in a test file; \`toStrictEqual\` for structural assertions; mock at the boundary (the network, the filesystem, an SDK's command layer) and never \`fetch\`, \`axios\`, or one of our own methods.
- Test names follow verb + outcome + when/for + condition, with \`#methodName\` prefixing a service-method test and \`[GET](/path)\` prefixing an endpoint test. Match the wording of the titles already in the file you are editing; a file whose titles drift between styles is a finding.
- Write test titles in plain everyday language. No reviewer jargon and no shorthand a reader would have to decode.
- AGENTS.md's "Testing Standards" section names this repo's own machinery (\`@pd4castr/server/test-utils\`, \`@pd4castr/mock-api\`, \`createTestDB\` isolation, \`MockedPartial\`). Where the two overlap, follow AGENTS.md — it knows the local helpers.
`
  : '';

/**
 * Ground rules for an agent that fixes a submitted PR. Unlike build-feature's
 * worktree rules, the fixer works on the checked-out PR branch and pushes to it.
 */
const REPO_RULES = `
Ground rules for working in this repo:
- Read AGENTS.md at the repo root before writing any code; its conventions (module order, function-name prefixes, testing rules, one-export-per-file, no non-null assertions, no type casts) are binding.
- Check out the PR branch first: \`gh pr checkout ${prNumber}\`. Work on that branch; never commit on main.
- Node is pinned via Volta (24.x). Run all commands through the repo's toolchain; do not switch Node versions. Run \`pnpm install\` if dependency manifests changed.
- Git hooks are lefthook — read lefthook.yml at the repo root for what each hook gates. NEVER bypass hooks with --no-verify or by editing hook files. If a hook fails, fix the cause and re-commit.
- If your changed tests touch Postgres, start the test database first: \`docker compose -f docker-compose.test.yml up -d\` (test Postgres listens on host port 5999).
- Run tests with \`pnpm test <files>\` from the repo root (targeted). For broad runs pass \`--maxWorkers=4\`. Never run \`pnpm vitest\` directly.
- Use Conventional Commits with a scope from the AGENTS.md scope list (one per workspace, e.g. \`fix(api): …\`); omit the scope only when a change legitimately spans multiple workspaces.
${TESTING_RULES}`;

const reviewTestingDimension = guidelinesAvailable
  ? `
Every test file the diff touches is reviewed against the Pipelabs testing standard, not against the tests already in the repo — existing files predate the standard and are not the benchmark. Read ${GUIDELINES_DIR}/testing/README.md and ${GUIDELINES_DIR}/testing/writing-tests.md before judging any test, plus the topic doc for what is being tested (test-data.md, boundary-mocking.md, database.md, frontend.md in the same directory). Check at minimum: flat \`test()\` with no \`describe\`/\`it\`; a local \`setupTest()\` instead of \`beforeEach\`; \`toStrictEqual\` for structural assertions; mocking at the boundary rather than of our own methods; and test titles that follow verb + outcome + when/for + condition (\`#methodName\` prefix for service methods, \`[GET](/path)\` for endpoints), worded in plain language and consistent within each file. A violation of any of these is blocking.
`
  : '';

const reviewPreamble = `You are reviewing submitted PR #${prNumber}, which is already open and has human review comments. Repo root is the current directory. Read AGENTS.md first — its conventions are binding and convention violations that tooling cannot catch are in scope.

Gather the full picture before classifying:
- The diff: \`gh pr diff ${prNumber}\`. Read surrounding source where the diff alone is ambiguous (\`gh pr checkout ${prNumber}\` if you need the files locally, but do not modify anything).
- The human feedback: \`gh pr view ${prNumber} --comments\` for the conversation, and \`gh api repos/{owner}/{repo}/pulls/${prNumber}/comments\` for inline review comments. Determine which comments are still unresolved / requesting changes.
${reviewTestingDimension}
Classify each finding:
- blocking: unresolved human review comments that request a change, correctness bugs, broken or missing tests for new behaviour, tests that violate the testing standard, security problems, AGENTS.md violations that hooks/CI will not catch. When a finding comes from a human comment, quote the ask in the summary and cite the file/line it refers to.
- minor: real but non-blocking improvements. Report them; they are surfaced to the human, not fixed here.
Do not modify any files. No praise, no restating the diff.`;

const fixPreamble = `A reviewer found blocking problems on submitted PR #${prNumber}. Fix exactly these findings — no drive-by refactors. Where a finding is a human review comment, address it faithfully to the reviewer's intent.
${REPO_RULES}
After fixing: commit (hooks must pass) and push to the PR branch with \`git push\` (no force). If the branch has fallen behind main and cannot push, \`git fetch origin\` and \`git rebase origin/main\`, resolve conflicts faithfully to both sides' intent (rerun \`pnpm install\` if manifests changed), push with \`--force-with-lease\`, and return resolvedConflicts=true.

The blocking findings to fix:`;

phase('Review');
const result = await workflow('review-loop', {
  reviewPreamble,
  fixPreamble,
  reviewerModel: 'sonnet',
  fixerModel: 'sonnet',
  reviewerEffort: 'medium',
  fixerEffort: 'medium',
  rounds,
  phaseLabel: 'Review',
});

if (result.status === 'agent-died')
  return { status: 'failed', pr: prNumber, reason: result.reason };
if (result.status === 'fix-blocked')
  return {
    status: 'blocked',
    pr: prNumber,
    reason: result.reason,
    outstandingFindings: result.blocking,
    minorFindings: result.minorFindings,
  };
if (result.status === 'blocking-remaining')
  return {
    status: 'review-blocked',
    pr: prNumber,
    reason: `blocking findings remain after ${rounds} fix rounds`,
    outstandingFindings: result.blocking,
    minorFindings: result.minorFindings,
  };

log(`PR #${prNumber} review clean (${result.minorFindings.length} minor finding(s) noted)`);
return {
  status: 'clean',
  pr: prNumber,
  findings: result.findings,
  minorFindings: result.minorFindings,
  resolvedConflicts: result.resolvedConflicts,
};

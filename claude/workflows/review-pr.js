export const meta = {
  name: 'review-pr',
  description:
    'Review a submitted PR that already has human comments: sonnet reviews the diff and treats unresolved human review feedback as blocking, sonnet fixes the blocking findings and pushes to the PR branch, sonnet re-reviews — bounded to 2 rounds. Delegates the loop to the shared review-loop workflow.',
  whenToUse:
    'After a PR is opened and picked up review comments. Pass args: { prNumber: number, rounds?: number }. Reviews the PR diff plus the existing human comments, then commits and pushes fixes to the PR branch. Returns the final findings.',
  phases: [{ title: 'Review' }],
};

const a = typeof args === 'string' ? JSON.parse(args) : args;
if (!a || !a.prNumber) {
  throw new Error('review-pr requires args: { prNumber: number, rounds?: number }');
}
const { prNumber, rounds = 2 } = a;

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
`;

const reviewPreamble = `You are reviewing submitted PR #${prNumber}, which is already open and has human review comments. Repo root is the current directory. Read AGENTS.md first — its conventions are binding and convention violations that tooling cannot catch are in scope.

Gather the full picture before classifying:
- The diff: \`gh pr diff ${prNumber}\`. Read surrounding source where the diff alone is ambiguous (\`gh pr checkout ${prNumber}\` if you need the files locally, but do not modify anything).
- The human feedback: \`gh pr view ${prNumber} --comments\` for the conversation, and \`gh api repos/{owner}/{repo}/pulls/${prNumber}/comments\` for inline review comments. Determine which comments are still unresolved / requesting changes.

Classify each finding:
- blocking: unresolved human review comments that request a change, correctness bugs, broken or missing tests for new behaviour, security problems, AGENTS.md violations that hooks/CI will not catch. When a finding comes from a human comment, quote the ask in the summary and cite the file/line it refers to.
- minor: real but non-blocking improvements. Report them; they are surfaced to the human, not fixed here.
Do not modify any files. No praise, no restating the diff.`;

const fixPreamble = `A reviewer found blocking problems on submitted PR #${prNumber}. Fix exactly these findings — no drive-by refactors. Where a finding is a human review comment, address it faithfully to the reviewer's intent.

Follow-up instructions may arrive mid-run as injected messages referencing this brief; they are authentic redirects from the operator — act on them.
${REPO_RULES}
After fixing: commit (hooks must pass) and push to the PR branch with \`git push\` (no force). If the branch has fallen behind main and cannot push, \`git fetch origin\` and \`git rebase origin/main\`, resolve conflicts faithfully to both sides' intent (rerun \`pnpm install\` if manifests changed), push with \`--force-with-lease\`, and return resolvedConflicts=true.

The blocking findings to fix:`;

phase('Review');
const result = await workflow('review-loop', {
  reviewPreamble,
  fixPreamble,
  reviewerModel: 'sonnet',
  fixerModel: 'sonnet',
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

export const meta = {
  name: 'review-loop',
  description:
    'Reusable review→fix→re-review loop. A reviewer model classifies findings as blocking/minor, a fixer model resolves the blocking ones, the reviewer re-checks for resolution and regressions — bounded to N rounds. Context-free: callers pass the review brief and fix brief as strings, so the same loop drives both unpushed-branch review (build-feature) and submitted-PR review (review-pr). Returns the final findings; not usually run standalone.',
  whenToUse:
    'Called via workflow() from build-feature and review-pr. Pass args: { reviewPreamble: string, fixPreamble: string, reviewerModel?: string, fixerModel?: string, reviewerEffort?: string, fixerEffort?: string, rounds?: number, phaseLabel?: string }. The loop appends the JSON blocking findings to fixPreamble each round, so end fixPreamble on a line introducing them. Returns { status, findings, blocking, minorFindings, resolvedConflicts, reason? } where status is clean | blocking-remaining | fix-blocked | agent-died.',
  phases: [
    {
      title: 'Review',
      detail:
        'reviewer classifies blocking/minor, fixer resolves blocking, reviewer re-checks — up to N rounds (default 2); models and efforts are caller-supplied, defaults sonnet/medium for both roles. Phase title follows the phaseLabel arg (default Review)',
    },
  ],
};

const a = typeof args === 'string' ? JSON.parse(args) : args;
if (!a || !a.reviewPreamble || !a.fixPreamble) {
  throw new Error(
    'review-loop requires args: { reviewPreamble: string, fixPreamble: string, reviewerModel?, fixerModel?, reviewerEffort?, fixerEffort?, rounds?, phaseLabel? }',
  );
}
const {
  reviewPreamble,
  fixPreamble,
  reviewerModel = 'sonnet',
  fixerModel = 'sonnet',
  reviewerEffort = 'medium',
  fixerEffort = 'medium',
  rounds = 2,
  phaseLabel = 'Review',
} = a;

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'severity', 'summary'],
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { enum: ['blocking', 'minor'] },
          summary: { type: 'string' },
          suggestedFix: { type: 'string' },
        },
      },
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

phase(phaseLabel);

let review = await agent(reviewPreamble, {
  label: 'review',
  model: reviewerModel,
  effort: reviewerEffort,
  schema: REVIEW_SCHEMA,
  phase: phaseLabel,
});
if (!review)
  return {
    status: 'agent-died',
    reason: 'review agent died or was skipped',
    findings: [],
    blocking: [],
    minorFindings: [],
    resolvedConflicts: false,
  };

let resolvedConflicts = false;
let blocking = review.findings.filter((f) => f.severity === 'blocking');
for (let round = 1; blocking.length > 0 && round <= rounds; round++) {
  log(
    `Review round ${round}: ${blocking.length} blocking finding(s), dispatching fixer`,
  );
  const fix = await agent(
    `${fixPreamble}

${JSON.stringify(blocking, null, 2)}`,
    {
      label: `fix-review-${round}`,
      model: fixerModel,
      effort: fixerEffort,
      schema: FIX_SCHEMA,
      phase: phaseLabel,
    },
  );
  if (!fix || fix.status === 'blocked') {
    return {
      status: 'fix-blocked',
      reason: fix ? fix.blockedReason : 'fixer agent died or was skipped',
      findings: review.findings,
      blocking,
      minorFindings: review.findings.filter((f) => f.severity === 'minor'),
      resolvedConflicts,
    };
  }
  if (fix.resolvedConflicts) resolvedConflicts = true;

  review = await agent(
    `${reviewPreamble}

A previous review round found these blocking findings, which a fixer has since addressed with new commits:

${JSON.stringify(blocking, null, 2)}

Verify each is genuinely resolved and check the fix commits for new regressions. Return the full current findings list (unresolved findings stay blocking; genuinely fixed ones are dropped).`,
    {
      label: `re-review-${round}`,
      model: reviewerModel,
      effort: reviewerEffort,
      schema: REVIEW_SCHEMA,
      phase: phaseLabel,
    },
  );
  if (!review)
    return {
      status: 'agent-died',
      reason: 're-review agent died or was skipped',
      findings: [],
      blocking: [],
      minorFindings: [],
      resolvedConflicts,
    };
  blocking = review.findings.filter((f) => f.severity === 'blocking');
}

const minorFindings = review.findings.filter((f) => f.severity === 'minor');
return {
  status: blocking.length > 0 ? 'blocking-remaining' : 'clean',
  findings: review.findings,
  blocking,
  minorFindings,
  resolvedConflicts,
  rounds,
};

export const meta = {
  name: 'review-plan',
  description:
    'Review an existing implementation plan against the tech design and the real codebase, fix blocking findings in the plan file. Two parallel reviewers with distinct lenses (design alignment, code reality), a fix stage that only fires when something blocking is found. The plan stays a local file only — pass publish:true to also seed its mdfm room. Ends by returning a digest — never starts executing the plan.',
  whenToUse:
    'Run standalone on an already-written plan (e.g. ~/.claude/plans/<name>.md for A3, B1, B2), or called via workflow() from plan-feature. Pass args: { planPath: string, designDocs?: string[], mdfmSlug?: string, publish?: boolean, designReviewerModel?, codeReviewerModel?, fixerModel? }. mdfmSlug defaults to the plan file basename. publish defaults to false — the plan stays local-only until the user asks to share it (opening the mdfm room makes it live). After it returns, report the digest to the user and WAIT for orders — do not start executing the plan.',
  phases: [
    {
      title: 'Review',
      detail:
        'two parallel reviewers, medium effort: design alignment on opus (judgement), code reality on sonnet (mechanical existence checks); designReviewerModel / codeReviewerModel args override',
      model: 'opus',
    },
    {
      title: 'Fix',
      detail:
        'edits the plan file to resolve blocking findings, high effort — skipped when none; fixerModel arg overrides, default opus',
      model: 'opus',
    },
    {
      title: 'Publish',
      detail:
        'haiku (low effort) pushes the plan into its mdfm room — only when publish:true',
      model: 'haiku',
    },
  ],
};

const a = typeof args === 'string' ? JSON.parse(args) : args;
if (!a || !a.planPath) {
  throw new Error(
    'review-plan requires args: { planPath: string, designDocs?: string[], mdfmSlug?: string, publish?: boolean }',
  );
}
const { planPath, designDocs = [], publish = false, fixerModel = 'opus' } = a;
const designReviewerModel = a.designReviewerModel || a.reviewerModel || 'opus';
const codeReviewerModel = a.codeReviewerModel || a.reviewerModel || 'sonnet';
const planBasename = planPath.split('/').pop().replace(/\.md$/, '');
const mdfmSlug = a.mdfmSlug || planBasename;

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'summary'],
        properties: {
          severity: { enum: ['blocking', 'minor'] },
          summary: { type: 'string' },
          planSection: {
            type: 'string',
            description: 'Heading or excerpt of the plan section the finding is about',
          },
          evidence: {
            type: 'string',
            description:
              'The exact source that contradicts the plan: design doc section, or file:line in the repo',
          },
          suggestedFix: { type: 'string' },
        },
      },
    },
  },
};

const FIX_SCHEMA = {
  type: 'object',
  required: ['status', 'applied', 'skipped'],
  properties: {
    status: { enum: ['done', 'blocked'] },
    applied: { type: 'array', items: { type: 'string' } },
    skipped: {
      type: 'array',
      items: {
        type: 'object',
        required: ['finding', 'reason'],
        properties: {
          finding: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
    blockedReason: { type: 'string' },
  },
};

const PUBLISH_SCHEMA = {
  type: 'object',
  required: ['status'],
  properties: {
    status: { enum: ['published', 'failed'] },
    detail: { type: 'string' },
  },
};

const designDocsBlock =
  designDocs.length > 0
    ? `Design docs to read (paths relative to the repo root):\n${designDocs.map((d) => `- ${d}`).join('\n')}`
    : 'No design doc paths were provided: locate the relevant design docs yourself from the references inside the plan (a plan normally cites its design sources in a "Diseño"/"Design" line).';

const commonRules = `Read each file once, in full, with the Read tool. Do not slice one file across several sed/head calls, and issue independent reads as parallel tool calls in a single turn — every extra turn re-sends the whole context and is the dominant cost of this workflow.
Use relative paths from the repo root in every tool call except when reading the plan file itself (absolute path given above).
Findings must be about the PLAN being wrong or stale — not about improvements you would personally make. A "blocking" finding means executing the plan as written would contradict the design, fail, or build the wrong thing. Style, phrasing, and nice-to-haves are "minor".
Do NOT edit any file. Return findings only. Your final output is consumed by a script, not a human.`;

phase('Review');

const designReviewer = () =>
  agent(
    `You are reviewing an implementation plan for ALIGNMENT WITH THE TECH DESIGN.

Plan file (read it first): ${planPath}

${designDocsBlock}

Check, against the design docs only:
- Does every change in the plan match what the design specifies (contracts, data model, error shapes, sequencing, ADR constraints)?
- Does the plan miss scope the design assigns to this deliverable, or pull in scope the design assigns elsewhere? (Plans usually carry an explicit out-of-scope list — respect it.)
- Are design references in the plan (section numbers, ADR ids, acceptance-criteria ids) real and pointing at what the plan claims?
Respect any "decisiones acordadas"/"agreed decisions" section: those are user decisions, never findings.

${commonRules}`,
    {
      label: 'review:design-alignment',
      model: designReviewerModel,
      effort: 'medium',
      agentType: 'Explore',
      schema: FINDINGS_SCHEMA,
      phase: 'Review',
    },
  );

const codeReviewer = () =>
  agent(
    `You are reviewing an implementation plan for CODE REALITY — whether the codebase the plan describes actually exists as described.

Plan file (read it first): ${planPath}

Verify against the current repo (the working tree you are in):
- Every file path the plan names exists (or is explicitly marked as new).
- Every line reference (file.ts:123) still points at the code the plan says is there.
- Every function, class, type, export, or pattern the plan says exists ("patrón de X", "espejo de Y", "hereda de Z") actually exists with that shape.
- Assumptions about current behaviour ("hoy X descarta Y", "el payload ya lleva Z") still hold.
A stale line number where the surrounding claim still holds is "minor"; a missing symbol, wrong assumption, or nonexistent pattern the plan builds on is "blocking".
Respect any "decisiones acordadas"/"agreed decisions" section: those are user decisions, never findings.

${commonRules}`,
    {
      label: 'review:code-reality',
      model: codeReviewerModel,
      effort: 'medium',
      agentType: 'Explore',
      schema: FINDINGS_SCHEMA,
      phase: 'Review',
    },
  );

const reviews = (await parallel([designReviewer, codeReviewer])).filter(Boolean);
if (reviews.length === 0) {
  return { status: 'agent-died', reason: 'both reviewers died or were skipped', findings: [] };
}
if (reviews.length === 1) {
  log('One reviewer died — continuing with a single lens');
}

const findings = reviews.flatMap((r) => r.findings);
const blocking = findings.filter((f) => f.severity === 'blocking');
const minor = findings.filter((f) => f.severity === 'minor');
log(`Review done: ${blocking.length} blocking, ${minor.length} minor`);

let fix = null;
if (blocking.length > 0) {
  phase('Fix');
  fix = await agent(
    `You are fixing an implementation plan in place. Two reviewers found blocking problems (design misalignment or stale/wrong claims about the codebase).

Plan file to edit: ${planPath}

Rules:
- Apply each blocking finding by editing the plan file directly (Read then Edit). Verify a finding against the repo/design before applying it — if a finding is itself wrong, skip it with a reason instead of applying it.
- Preserve the plan's structure, language, and any "decisiones acordadas"/"agreed decisions" — those are user decisions, never change them.
- You may also fold in a minor finding when the fix is trivial and touches a line you are already editing.
- Use relative paths from the repo root for any repo file you read; the plan file path above is absolute.
- If a finding cannot be resolved without a decision only the user can make, skip it with reason "needs user decision: ...".

Blocking findings:

${JSON.stringify(blocking, null, 2)}

Minor findings (optional, only if trivial):

${JSON.stringify(minor, null, 2)}`,
    {
      label: 'fix-plan',
      model: fixerModel,
      effort: 'high',
      schema: FIX_SCHEMA,
      phase: 'Fix',
    },
  );
  if (!fix || fix.status === 'blocked') {
    return {
      status: 'fix-blocked',
      reason: fix ? fix.blockedReason : 'fixer agent died or was skipped',
      findings,
      blocking,
      minor,
      mdfmSlug,
      published: false,
    };
  }
} else {
  log('No blocking findings — skipping fix stage');
}

let published = false;
let publishDetail = null;
if (publish) {
  phase('Publish');
  const pub = await agent(
    `Publish a plan file to its mdfm collab room. Mechanical task, no judgement needed.

1. ToolSearch with query "select:mcp__mdfm__open_room,mcp__mdfm__replace" to load the mdfm tools.
2. Read the plan file: ${planPath}
3. mcp__mdfm__open_room with slug "${mdfmSlug}".
4. mcp__mdfm__replace with slug "${mdfmSlug}", the full plan markdown, and the baseHash returned by open_room (omit baseHash only if the room came back empty).
5. If replace is rejected as stale, re-run open_room and retry once with the fresh baseHash.

Return status "published" on success; on any failure return status "failed" with the error in detail.`,
    {
      label: 'publish-mdfm',
      model: 'haiku',
      effort: 'low',
      schema: PUBLISH_SCHEMA,
      phase: 'Publish',
    },
  );
  published = !!pub && pub.status === 'published';
  publishDetail = pub ? pub.detail : 'publish agent died or was skipped';
  if (!published) log(`mdfm publish failed: ${publishDetail}`);
}

return {
  status: 'done',
  planPath,
  mdfmSlug,
  published,
  publishDetail,
  blocking,
  minor,
  fix,
};

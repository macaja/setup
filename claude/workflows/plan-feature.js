export const meta = {
  name: 'plan-feature',
  description:
    'Plan a feature end to end: a Fable planner reads the tech design and the codebase and writes an implementation plan named after the feature branch, then the review-plan workflow reviews it (design alignment + code reality) and fixes blocking findings. The plan stays a local file — nothing is published. Returns a digest — never starts executing the plan.',
  whenToUse:
    'Run when a feature needs a fresh implementation plan. Pass args: { feature: string, branch: string, designDocs?: string[], planDir?: string }. feature is the full task context (deliverable, ticket/epic refs, agreed decisions); branch is the feat branch name — the plan file is named after it (slashes become dashes). The finished plan stays a local file; publish it only if the user asks. If a plan already exists, run review-plan instead. After it returns, report the digest to the user and WAIT for orders — do NOT ask to execute the plan; the user will say when.',
  phases: [
    {
      title: 'Plan',
      detail:
        'fable (medium effort) reads the design docs and codebase, writes the plan file, then hands off to the review-plan workflow (see its meta for reviewer models and efforts)',
      model: 'fable',
    },
  ],
};

const a = typeof args === 'string' ? JSON.parse(args) : args;
if (!a || !a.feature || !a.branch) {
  throw new Error(
    'plan-feature requires args: { feature: string, branch: string, designDocs?: string[], planDir?: string }',
  );
}
const {
  feature,
  branch,
  designDocs = [],
  planDir = '/Users/macaja/.claude/plans',
} = a;
const slug = branch.replace(/\//g, '-');
const planPath = `${planDir}/${slug}.md`;

const PLAN_SCHEMA = {
  type: 'object',
  required: ['status', 'sources', 'digest'],
  properties: {
    status: { enum: ['done', 'blocked'] },
    blockedReason: { type: 'string' },
    sources: {
      type: 'array',
      description:
        'Repo-relative paths of the design docs and key code files the plan relies on',
      items: { type: 'string' },
    },
    digest: {
      type: 'string',
      description: 'Five lines max: what the plan covers and its key decisions',
    },
  },
};

const designDocsBlock =
  designDocs.length > 0
    ? `Start from these design docs (paths relative to the repo root):\n${designDocs.map((d) => `- ${d}`).join('\n')}\nFollow their references to related docs (ADRs, sibling design files) as needed.`
    : 'No design doc paths were provided: locate the relevant docs under docs/projects/ (and any ADRs they cite) from the feature context below.';

phase('Plan');

const plan = await agent(
  `Write an implementation plan for the feature described below, then save it as a markdown file.

Feature context (includes any agreed decisions — treat those as fixed, they are the user's calls):

${feature}

${designDocsBlock}

How to work:
- Read each file once, in full, with the Read tool. Do not slice one file across several sed/head calls, and issue independent reads as parallel tool calls in a single turn — every extra turn re-sends the whole context and is the dominant cost of this workflow.
- Read the design docs AND the code they touch. Every file path, symbol, and pattern the plan cites must exist in the current working tree — verify by reading, include file:line references where they help the implementer.
- Use relative paths from the repo root in every tool call except writing the plan file itself.
- Plan structure: Context (what this deliverable is, its design sources, agreed decisions, explicit out-of-scope list), Cambios (numbered, per package/module, concrete: files, symbols, patterns to follow), Tests, Riesgos/bordes, Verificación. Match the language of the feature context (Spanish context → Spanish plan; code identifiers stay as-is).
- Scope discipline: plan ONLY this deliverable. Anything the design assigns to another deliverable goes in the out-of-scope list.

Write the finished plan to: ${planPath}

Return sources (the repo-relative design docs + key code files the plan relies on, so reviewers read only those) and a five-line digest. If you cannot produce a plan (missing design, contradictory context), return status "blocked" with the reason.`,
  {
    label: 'plan',
    model: 'fable',
    effort: 'medium',
    schema: PLAN_SCHEMA,
    phase: 'Plan',
  },
);

if (!plan) {
  return { status: 'agent-died', reason: 'planner died or was skipped' };
}
if (plan.status === 'blocked') {
  return { status: 'plan-blocked', reason: plan.blockedReason };
}
log(`Plan written to ${planPath} — handing off to review-plan`);

const review = await workflow('review-plan', {
  planPath,
  designDocs: plan.sources,
  mdfmSlug: slug,
  publish: false,
});

return {
  status: review.status,
  planPath,
  mdfmSlug: slug,
  digest: plan.digest,
  review,
};

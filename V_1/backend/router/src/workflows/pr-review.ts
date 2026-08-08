/**
 * The demo workflow: "Should I merge this PR?"
 *
 * Four steps. `bugsum` consumes `diff`'s output, so the DAG is real — three run
 * in parallel, then one. All four providers are on distinct payout addresses,
 * which is what makes the atomic group genuinely multi-payee.
 */
import type { WorkflowStep } from "@axis/shared";

export interface WorkflowDef {
  id: string;
  steps: (WorkflowStep & { endpointEnv: string; path: string })[];
}

export const PR_REVIEW: WorkflowDef = {
  id: "pr-review",
  steps: [
    {
      id: "diff",
      provider: "diff-explainer",
      endpointEnv: "PROVIDER_DIFF_URL",
      path: "/diff/explain",
      input: { diff: "${inputs.diff}" },
    },
    {
      id: "guardrail",
      provider: "guardrail-checker",
      endpointEnv: "PROVIDER_GUARDRAIL_URL",
      path: "/guardrail/check",
      input: { text: "${inputs.diff}" },
    },
    {
      id: "roast",
      provider: "commit-roaster",
      endpointEnv: "PROVIDER_ROASTER_URL",
      path: "/commit/roast",
      input: { message: "${inputs.commitMessage}" },
    },
    {
      id: "bugsum",
      provider: "bug-summarizer",
      endpointEnv: "PROVIDER_BUGSUM_URL",
      path: "/bug/summarize",
      // Real dependency: consumes diff's output → runs in batch 1.
      input: { report: "${steps.diff.output.summary}" },
    },
  ],
};

export const WORKFLOWS: Record<string, WorkflowDef> = { "pr-review": PR_REVIEW };

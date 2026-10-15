import type { LinearTriggerProblem } from '@haus/api';

// `linear` Triggers render read-only until their authoring lands
// (specs/linear-triggers.md#app-ui).

const problemTitles: Record<LinearTriggerProblem, string> = {
    agent_access_revoked: 'Agent access revoked',
    references_unavailable: 'References unavailable',
    sign_in_required: 'Sign in required',
    teams_unavailable: 'Teams unavailable',
    workspace_removed: 'Workspace removed',
};

/** The short name a list row's chip shows. */
export function linearProblemTitle(problem: LinearTriggerProblem) {
    return problemTitles[problem];
}

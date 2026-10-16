import { createRouter } from '../trpc.ts';
import { linearCreateIdentityDraft } from './create-identity-draft.ts';
import { linearIdentities } from './identities.ts';
import { linearIssue } from './issue.ts';
import { onLinearIssueChanged } from './on-issue-changed.ts';
import { onLinearUpdated } from './on-updated.ts';
import { linearReferences } from './references.ts';
import { linearRemoveIdentity } from './remove-identity.ts';
import { linearSaveIdentityCredentials } from './save-identity-credentials.ts';
import { linearSetDefaultAgent } from './set-default-agent.ts';
import { linearStartIdentityInstall } from './start-identity-install.ts';
import { linearStartInstall } from './start-install.ts';
import { linearSyncTeams } from './sync-teams.ts';
import { linearWorkspaces } from './workspaces.ts';

/**
 * The Linear connection's procedures (specs/linear-app.md#procedures-and-events),
 * one file per procedure. Input and result schemas are in `@haus/api`
 * `linear.ts` and `linear-issues.ts`.
 */
export const linearRouter = createRouter({
    createIdentityDraft: linearCreateIdentityDraft,
    identities: linearIdentities,
    issue: linearIssue,
    onIssueChanged: onLinearIssueChanged,
    onUpdated: onLinearUpdated,
    references: linearReferences,
    removeIdentity: linearRemoveIdentity,
    saveIdentityCredentials: linearSaveIdentityCredentials,
    setDefaultAgent: linearSetDefaultAgent,
    startIdentityInstall: linearStartIdentityInstall,
    startInstall: linearStartInstall,
    syncTeams: linearSyncTeams,
    workspaces: linearWorkspaces,
});

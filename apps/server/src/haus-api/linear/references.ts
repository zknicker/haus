import {
    type LinearReference,
    type LinearReferenceKind,
    linearReferencesInputSchema,
    linearReferencesSchema,
} from '@haus/api';
import { workspaceCredentialId } from '../../linear/agent-label-reads.ts';
import { requireLinearWorkspace } from '../../linear/authority.ts';
import { LinearSignInRequiredError } from '../../linear/linear-errors.ts';
import { readTeamAccess } from '../../linear/team-access.ts';
import { type LinearCatalog, readLinearTriggerCatalog } from '../../linear/trigger-catalog.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { linearAuthoring } from '../../triggers/linear-trigger-config.ts';
import { linearClock, linearProcedure } from './procedure.ts';

/**
 * `linear.references`: the pickers behind a `linear` Trigger's filters
 * (specs/linear-triggers.md#app-ui). Teams come from the workspace actor's
 * team access; every other kind is one catalog read with its token. The App
 * stores ids; names are for display only.
 */
export const linearReferences = linearProcedure
    .input(linearReferencesInputSchema)
    .output(linearReferencesSchema)
    .query(async ({ ctx, input }) => {
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        const workspace = await requireLinearWorkspace(ctx.hausDb, input);
        const credentialId = await workspaceCredentialId(ctx.hausDb, workspace.id);
        if (!credentialId) {
            throw new LinearSignInRequiredError();
        }
        const matches = (reference: LinearReference) =>
            !input.query || reference.name.toLowerCase().includes(input.query.toLowerCase());
        if (input.kind === 'teams') {
            const access = await readTeamAccess(ctx.hausDb, credentialId, linearClock.now());
            return access.teams
                .map((team) => ({
                    id: team.id,
                    name: `${team.name} (${team.key})`,
                    teamId: team.id,
                }))
                .filter(matches);
        }
        const authoring = linearAuthoring(ctx.hausDb, ctx.linear);
        const token = await authoring.accessToken(credentialId);
        const catalog = await readLinearTriggerCatalog(authoring.fetch, token);
        return referencesOf(catalog, input.kind).filter(matches);
    });

function referencesOf(
    catalog: LinearCatalog,
    kind: Exclude<LinearReferenceKind, 'teams'>
): LinearReference[] {
    switch (kind) {
        case 'labels':
            return catalog.labels.map((label) => ({ ...label }));
        case 'states':
            return catalog.states.map((state) => ({
                id: state.id,
                name: state.name,
                teamId: state.teamId,
            }));
        case 'projects':
            return catalog.projects.map((project) => ({
                id: project.id,
                name: project.name,
                teamId: null,
            }));
        case 'project_statuses':
            return catalog.projectStatuses.map((status) => ({ ...status, teamId: null }));
        default:
            return catalog.users.map((user) => ({
                id: user.id,
                name:
                    user.displayName === user.name
                        ? user.name
                        : `${user.name} (${user.displayName})`,
                teamId: null,
            }));
    }
}

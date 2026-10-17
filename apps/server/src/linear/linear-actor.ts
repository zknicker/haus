import type { LinearTeam } from '@haus/api';

// The actors one Linear tool call can run as (specs/linear-app.md#choosing-the-actor):
// the workspace actor (the Haus app) or the Agent's own identity.

export interface LinearActor {
    appUserId: string;
    /** The Agent's display name on a workspace-actor write; Linear honours it on creates. */
    createAsUser: string | null;
    credentialId: string;
    kind: 'identity' | 'workspace';
}

/**
 * What one Agent can act as in one workspace, loaded once per call. `teams`
 * and `memberTeamIds` are write sets: empty once their sync is stale.
 */
export interface LinearActorContext {
    agentName: string;
    /** The Agent's `active` identity with a `valid` credential, if any. */
    identity: {
        appUserId: string;
        credentialId: string;
        handle: string;
        id: string;
        /** Teams the identity's app user is a member of. */
        memberTeamIds: string[];
        teams: LinearTeam[];
    } | null;
    workspace: {
        appUserId: string;
        credentialId: string;
        /** Teams the Haus app user is a member of. */
        memberTeamIds: string[];
        teams: LinearTeam[];
    };
}

export function workspaceActor(
    context: LinearActorContext,
    createAsUser: string | null
): LinearActor {
    return {
        appUserId: context.workspace.appUserId,
        createAsUser,
        credentialId: context.workspace.credentialId,
        kind: 'workspace',
    };
}

export function identityActor(identity: NonNullable<LinearActorContext['identity']>): LinearActor {
    return {
        appUserId: identity.appUserId,
        createAsUser: null,
        credentialId: identity.credentialId,
        kind: 'identity',
    };
}

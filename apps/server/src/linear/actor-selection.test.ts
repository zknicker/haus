import { describe, expect, test } from 'bun:test';
import { chooseLinearActor, sessionActor, writeActor } from './actor-selection.ts';
import type { LinearActor, LinearActorContext } from './linear-actor.ts';
import { membershipWriteActor } from './membership-actor.ts';
import { LinearTeamCache, linearToolAccess } from './target-teams.ts';
import { effectiveIdentityTeams } from './team-access.ts';

const design = { id: 'team-design', key: 'DES', name: 'Design' };
const ops = { id: 'team-ops', key: 'OPS', name: 'Ops' };
const legal = { id: 'team-legal', key: 'LEG', name: 'Legal' };

const context: LinearActorContext = {
    agentName: 'Juniper',
    identity: {
        appUserId: 'app-juniper',
        credentialId: 'lna_identity',
        handle: 'juniper',
        id: 'lni_juniper',
        // Juniper reaches Design ("All public teams") but is a member of no team.
        memberTeamIds: [],
        // Legal is the identity's but not the workspace's: outside effective access.
        teams: [design, legal],
    },
    workspace: {
        appUserId: 'app-haus',
        credentialId: 'lna_workspace',
        memberTeamIds: [design.id],
        teams: [design, ops],
    },
};

const noIdentity: LinearActorContext = { ...context, identity: null };

const hausAsJuniper: LinearActor = {
    appUserId: 'app-haus',
    createAsUser: 'Juniper',
    credentialId: 'lna_workspace',
    kind: 'workspace',
};

describe('team scope', () => {
    test('effective identity access is identity teams ∩ workspace teams', () => {
        expect(effectiveIdentityTeams([design, legal], [design, ops])).toEqual([design]);
    });

    test('a write inside effective access, or touching no team, is the identity', () => {
        expect(writeActor(context, [design])).toMatchObject({ kind: 'identity' });
        expect(writeActor(context, [])).toMatchObject({ kind: 'identity' });
    });

    test('an identity never falls back: a write partly outside its access is refused, naming its app', () => {
        expect(writeActor(context, [design, ops])).toEqual({
            detail: "Juniper's Linear app can't reach Ops. A workspace admin can change its team access under Linear → Settings → Applications → Juniper → Team access.",
            refused: 'linear_team_outside_access',
        });
    });

    test('an Agent without an identity writes through the Haus app posting as itself', () => {
        expect(writeActor(noIdentity, [design, ops])).toEqual(hausAsJuniper);
        expect(writeActor(noIdentity, [])).toEqual(hausAsJuniper);
    });
});

describe('team settings writes need membership', () => {
    test('an identity that reaches but is not a member of the team is refused, naming its app', () => {
        expect(membershipWriteActor(context, [design])).toEqual({
            detail: "Juniper's Linear app isn't a member of Design, so it can't change that team's settings. A workspace admin can add it under Linear → Settings → Applications → Juniper → Team access.",
            refused: 'linear_team_membership_required',
        });
    });

    test('an identity that does not reach a target team is refused, naming its app', () => {
        expect(membershipWriteActor(context, [design, ops])).toEqual({
            detail: "Juniper's Linear app can't reach Ops. A workspace admin can change its team access under Linear → Settings → Applications → Juniper → Team access.",
            refused: 'linear_team_outside_access',
        });
    });

    test('an identity member of every target team writes as itself', () => {
        const member = {
            ...context,
            identity: context.identity && { ...context.identity, memberTeamIds: [design.id] },
        };
        expect(membershipWriteActor(member, [design])).toMatchObject({ kind: 'identity' });
    });

    test('without an identity, the member Haus app writes posting as the Agent', () => {
        expect(membershipWriteActor(noIdentity, [design])).toEqual(hausAsJuniper);
    });

    test('without an identity, a team Haus is not a member of is refused, naming Haus', () => {
        expect(membershipWriteActor(noIdentity, [design, ops])).toEqual({
            detail: "Haus isn't a member of Ops in Linear, so it can't change that team's settings. A workspace admin can add it under Linear → Settings → Applications → Haus → Team access.",
            refused: 'linear_team_membership_required',
        });
    });

    test('a workspace label touches no team and needs no membership', () => {
        expect(membershipWriteActor(context, [])).toMatchObject({ kind: 'identity' });
        expect(membershipWriteActor(noIdentity, [])).toEqual(hausAsJuniper);
    });

    test('workflow states and team labels are membership writes; issue writes are not', async () => {
        const reader = {
            cache: new LinearTeamCache(),
            transport: (() => Promise.reject(new Error('no reads'))) as unknown as typeof fetch,
            workspaceToken: () => Promise.resolve('token'),
        };
        const choose = (tool: string, actorContext: LinearActorContext) =>
            chooseLinearActor({} as never, reader, {
                access: linearToolAccess[tool] ?? { kind: 'read' },
                agentId: 'agt_juniper',
                args: { team: 'OPS' },
                context: actorContext,
                workspaceId: 'lnw_workspace',
            });
        expect(await choose('create_workflow_state', noIdentity)).toMatchObject({
            refused: 'linear_team_membership_required',
        });
        expect(await choose('create_label', noIdentity)).toMatchObject({
            refused: 'linear_team_membership_required',
        });
        // An issue on Ops goes through the Haus app posting as an Agent without an identity.
        expect(await choose('create_issue', noIdentity)).toMatchObject({ actor: hausAsJuniper });
        // Juniper's identity cannot reach Ops, so every write there is refused.
        for (const tool of ['create_workflow_state', 'create_label', 'create_issue']) {
            expect(await choose(tool, context)).toMatchObject({
                refused: 'linear_team_outside_access',
            });
        }
    });
});

describe('session replies', () => {
    const owned = { agentId: 'agt_juniper', identityId: 'lni_juniper', status: 'active' };

    test('only the routed Agent may reply, and never to a closed session', () => {
        const input = { agentId: 'agt_other', issueTeamId: design.id };
        expect(sessionActor(context, owned, input)).toEqual({
            refused: 'linear_session_not_yours',
        });
        expect(
            sessionActor(
                context,
                { ...owned, status: 'handed_off' },
                { ...input, agentId: 'agt_juniper' }
            )
        ).toEqual({ refused: 'linear_session_closed' });
    });

    test('an identity session never falls back to the workspace actor', () => {
        const input = { agentId: 'agt_juniper', issueTeamId: ops.id };
        expect(sessionActor(context, owned, input)).toEqual({
            refused: 'linear_session_actor_unavailable',
        });
        expect(sessionActor(context, owned, { ...input, issueTeamId: design.id })).toMatchObject({
            kind: 'identity',
        });
    });

    test('a Haus app session replies as the workspace actor', () => {
        expect(
            sessionActor(
                context,
                { ...owned, identityId: null },
                { agentId: 'agt_juniper', issueTeamId: null }
            )
        ).toMatchObject({ kind: 'workspace' });
    });
});

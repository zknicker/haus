import { describe, expect, test } from 'bun:test';
import { type LinearActorContext, sessionActor, writeActor } from './actor-selection.ts';
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
        // Legal is the identity's but not the workspace's: outside effective access.
        teams: [design, legal],
    },
    workspace: { appUserId: 'app-haus', credentialId: 'lna_workspace', teams: [design, ops] },
};

describe('team scope', () => {
    test('effective identity access is identity teams ∩ workspace teams', () => {
        expect(effectiveIdentityTeams([design, legal], [design, ops])).toEqual([design]);
    });

    test('a write inside effective access, or touching no team, is the identity', () => {
        expect(writeActor(context, [design]).kind).toBe('identity');
        expect(writeActor(context, []).kind).toBe('identity');
    });

    test('a write partly outside effective access is wholly the workspace actor', () => {
        expect(writeActor(context, [design, ops])).toEqual({
            appUserId: 'app-haus',
            createAsUser: 'Juniper',
            credentialId: 'lna_workspace',
            kind: 'workspace',
        });
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

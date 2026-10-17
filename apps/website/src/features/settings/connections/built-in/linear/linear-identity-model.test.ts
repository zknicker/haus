import { describe, expect, test } from 'bun:test';
import type { LinearIdentity } from '@haus/api';
import {
    identityForAgent,
    linearIdentityRow,
    linearMemberTeams,
    linearWorkspaceStatus,
} from './linear-identity-model.ts';

const now = Date.parse('2026-10-15T12:00:00.000Z');

function identity(overrides: Partial<LinearIdentity> = {}): LinearIdentity {
    return {
        agentId: 'agent_juniper',
        credentialsSaved: true,
        guidedFlow: {
            appName: 'Juniper',
            avatarUrl: 'https://haus.chat/api/avatars/av_1',
            callbackUrl: 'https://haus.chat/linear/oauth/callback',
            appsUrl: 'https://linear.app/settings/api/applications',
            createAppPrefillsWebhook: true,
            createAppUrl: 'https://linear.app/settings/api/applications/new',
            identityId: 'lni_0123456789abcdef',
            webhookEvents: ['agent_session_events', 'permission_changes', 'oauth_app_revoked'],
            webhookUrl: 'https://haus.chat/api/linear/webhook/lni_0123456789abcdef',
        },
        handle: 'juniper',
        id: 'lni_0123456789abcdef',
        lastDeliveryAt: null,
        memberTeamIds: ['team_eng'],
        status: 'active',
        workspaceId: 'lnw_0123456789abcdef',
        ...overrides,
    };
}

/** The Haus app is a member of Engineering, which the fixture identity also joined. */
const engineering = [{ id: 'team_eng', name: 'Engineering' }];
const fourTeams = [
    ...engineering,
    { id: 'team_design', name: 'Design' },
    { id: 'team_products', name: 'Products' },
    { id: 'team_ops', name: 'Operations' },
];

describe('linearIdentityRow', () => {
    test('an Agent without an identity posts via Haus, offers its own, and has no menu', () => {
        expect(linearIdentityRow(null, engineering)).toEqual({
            details: [],
            fact: 'Posts via Haus',
            menu: [],
            step: 'give',
        });
        expect(linearIdentityRow(identity({ status: 'removed' }), engineering).step).toBe('give');
    });

    test('a draft still posts via Haus and its line offers to finish setup', () => {
        expect(linearIdentityRow(identity({ handle: null, status: 'draft' }), engineering)).toEqual(
            {
                details: [],
                fact: 'Posts via Haus',
                menu: [],
                step: 'continue',
            }
        );
    });

    test('an active identity names its handle, which opens its menu, and its last delivery', () => {
        const row = linearIdentityRow(
            identity({ lastDeliveryAt: '2026-10-15T09:00:00.000Z' }),
            engineering,
            now
        );
        expect(row).toEqual({
            details: ['Last delivery 3h ago'],
            fact: 'Posts as @juniper',
            menu: ['rotate-secret', 'remove'],
            step: null,
        });
    });

    test('degraded identities name their state on the line and offer the fix', () => {
        expect(linearIdentityRow(identity({ status: 'inactive' }), engineering).details).toContain(
            'Inactive'
        );
        const signIn = linearIdentityRow(identity({ status: 'refresh_required' }), engineering);
        expect(signIn.details).toEqual(['Sign in required']);
        expect(signIn.step).toBe('reinstall');
        expect(signIn.menu).toEqual(['rotate-secret', 'remove']);
        expect(linearIdentityRow(identity({ status: 'revoked' }), engineering).details).toEqual([
            'Revoked',
        ]);
    });

    test("an active identity missing the Haus app's teams names them and offers the change", () => {
        const one = linearIdentityRow(identity(), [
            ...engineering,
            { id: 'team_design', name: 'Design' },
        ]);
        expect(one.details).toEqual(['Not a member of Design']);
        expect(one.menu).toEqual(['change-teams', 'rotate-secret', 'remove']);
        expect(
            linearIdentityRow(identity({ memberTeamIds: [] }), fourTeams.slice(0, 3)).details
        ).toEqual(['Not a member of Engineering, Design +1']);
    });

    test('the missing-team detail names two teams, then counts the rest', () => {
        expect(linearIdentityRow(identity(), fourTeams).details).toEqual([
            'Not a member of Design, Products +1',
        ]);
        expect(linearIdentityRow(identity({ memberTeamIds: [] }), fourTeams).details).toEqual([
            'Not a member of Engineering, Design +2',
        ]);
    });

    test('a covered identity, or one that is not active, carries no missing-team detail', () => {
        const covered = linearIdentityRow(
            identity({ memberTeamIds: fourTeams.map((team) => team.id) }),
            fourTeams
        );
        expect(covered.details).toEqual([]);
        expect(covered.menu).toEqual(['rotate-secret', 'remove']);
        // The Haus app is a member of no team: there is nothing for the identity to join.
        expect(linearIdentityRow(identity({ memberTeamIds: [] }), []).details).toEqual([]);
        for (const status of ['inactive', 'refresh_required', 'revoked'] as const) {
            const row = linearIdentityRow(identity({ memberTeamIds: [], status }), fourTeams);
            expect(row.details.some((detail) => detail.startsWith('Not a member'))).toBe(false);
            expect(row.menu).not.toContain('change-teams');
        }
    });

    test("the Haus app's member teams are the reachable teams it joined, by name", () => {
        expect(
            linearMemberTeams({
                memberTeamIds: ['team_eng', 'team_gone'],
                teams: [
                    { id: 'team_eng', key: 'ENG', name: 'Engineering' },
                    { id: 'team_design', key: 'DES', name: '' },
                ],
            })
        ).toEqual(engineering);
        expect(
            linearMemberTeams({
                memberTeamIds: ['team_design'],
                teams: [{ id: 'team_design', key: 'DES', name: '' }],
            })
        ).toEqual([{ id: 'team_design', name: 'DES' }]);
    });

    test('a removed identity never shadows a live one', () => {
        const removed = identity({ id: 'lni_removed00000000', status: 'removed' });
        const live = identity({ id: 'lni_live000000000000', status: 'draft' });
        expect(identityForAgent([removed, live], 'agent_juniper')?.id).toBe(live.id);
        expect(identityForAgent([removed], 'agent_juniper')).toBeNull();
    });

    test('an active workspace carries no chip', () => {
        expect(linearWorkspaceStatus('active')).toBeNull();
        expect(linearWorkspaceStatus('refresh_required')?.label).toBe('Sign in required');
    });
});

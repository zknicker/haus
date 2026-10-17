import { describe, expect, test } from 'bun:test';
import type { LinearWorkspace } from '@haus/api';
import {
    linearApplicationsSettingsUrl,
    linearTeamSettingsWarning,
    linearWorkspaceHealth,
} from './linear-workspace-health.ts';
import { linearIdentityArrival } from './use-linear-identity-arrival.ts';

const now = Date.parse('2026-10-16T12:00:00.000Z');
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString();

function workspace(
    overrides: Partial<
        Pick<
            LinearWorkspace,
            'lastDeliveryAt' | 'memberTeamIds' | 'status' | 'teams' | 'teamsSyncedAt'
        >
    > = {}
) {
    return {
        lastDeliveryAt: hoursAgo(2),
        memberTeamIds: ['team_1'],
        status: 'active' as const,
        teams: [{ id: 'team_1', key: 'ENG', name: 'Engineering' }],
        teamsSyncedAt: hoursAgo(1),
        ...overrides,
    };
}

describe('linearWorkspaceHealth', () => {
    test('a healthy workspace shows teams and hides its last delivery', () => {
        expect(linearWorkspaceHealth(workspace(), now)).toEqual({
            lastDelivery: null,
            missingMemberTeams: [],
            teamAccess: 'ok',
        });
        // A new workspace that never heard from Linear is not stale.
        expect(linearWorkspaceHealth(workspace({ lastDeliveryAt: null }), now).lastDelivery).toBe(
            null
        );
    });

    test('no team, or a team set the Server no longer trusts, means no team access', () => {
        expect(linearWorkspaceHealth(workspace({ teams: [] }), now).teamAccess).toBe('none');
        expect(
            linearWorkspaceHealth(workspace({ teamsSyncedAt: hoursAgo(25) }), now).teamAccess
        ).toBe('none');
    });

    describe('team settings', () => {
        const design = { id: 'team_design', key: 'DES', name: 'Design' };
        const ops = { id: 'team_ops', key: 'OPS', name: 'Ops' };
        const sales = { id: 'team_sales', key: 'SAL', name: 'Sales' };
        const support = { id: 'team_support', key: 'SUP', name: 'Support' };
        const teams = [design, ops, sales, support];
        const missingFor = (memberTeamIds: string[]) => {
            const health = linearWorkspaceHealth(workspace({ memberTeamIds, teams }), now);
            return {
                missing: health.missingMemberTeams,
                warning: linearTeamSettingsWarning(health.missingMemberTeams, teams),
            };
        };

        test('no membership at all says so once', () => {
            expect(missingFor([])).toEqual({
                missing: teams,
                warning: "Haus isn't a member of any team",
            });
        });

        test('partial membership names the missing teams, two then +N', () => {
            expect(missingFor([design.id, sales.id, support.id])).toEqual({
                missing: [ops],
                warning: 'Not a member of Ops',
            });
            expect(missingFor([design.id, support.id])).toEqual({
                missing: [ops, sales],
                warning: 'Not a member of Ops, Sales',
            });
            expect(missingFor([design.id])).toEqual({
                missing: [ops, sales, support],
                warning: 'Not a member of Ops, Sales +1',
            });
        });

        test('membership in every reachable team leaves nothing missing', () => {
            expect(missingFor(teams.map((team) => team.id)).missing).toEqual([]);
        });

        test('no team access already says no write lands, so team settings stay quiet', () => {
            expect(
                linearWorkspaceHealth(workspace({ memberTeamIds: [], teams: [] }), now)
                    .missingMemberTeams
            ).toEqual([]);
            expect(
                linearWorkspaceHealth(
                    workspace({ memberTeamIds: [], teams, teamsSyncedAt: hoursAgo(25) }),
                    now
                ).missingMemberTeams
            ).toEqual([]);
        });
    });

    test('the last delivery shows once Linear is silent a week or the workspace fails', () => {
        expect(
            linearWorkspaceHealth(workspace({ lastDeliveryAt: hoursAgo(24 * 8) }), now).lastDelivery
        ).toBe('8d ago');
        expect(
            linearWorkspaceHealth(workspace({ lastDeliveryAt: null, status: 'revoked' }), now)
                .lastDelivery
        ).toBe('Never');
    });
});

describe('linearIdentityArrival', () => {
    const active = { agentId: 'agent_tiny', id: 'lni_tiny', status: 'active' as const };

    test('an identity watched turning from draft to active has arrived', () => {
        const before = new Map([['lni_tiny', 'draft' as const]]);
        expect(linearIdentityArrival(before, [active], null)).toBe('agent_tiny');
        expect(
            linearIdentityArrival(new Map([['lni_tiny', 'active' as const]]), [active], null)
        ).toBe(null);
    });

    test("the callback's landing finds the install this browser remembered", () => {
        expect(linearIdentityArrival(null, [active], 'lni_tiny')).toBe('agent_tiny');
        expect(linearIdentityArrival(null, [{ ...active, status: 'draft' }], 'lni_tiny')).toBe(
            null
        );
        expect(linearIdentityArrival(null, [active], null)).toBeNull();
    });
});

test("Change in Linear opens the workspace's installed applications, not a reinstall", () => {
    expect(linearApplicationsSettingsUrl('haus-chat')).toBe(
        'https://linear.app/haus-chat/settings/applications'
    );
});

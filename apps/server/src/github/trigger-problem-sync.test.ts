import { describe, expect, test } from 'bun:test';
import { triggerProblemNoticeText } from './problem-notice.ts';
import { desiredProblem, githubAccessStaleMs } from './trigger-problem-sync.ts';

const now = new Date('2026-10-11T12:00:00.000Z');
const installation = {
    accessibleRepositoryIds: [1, 2],
    accessSyncedAt: new Date(now.getTime() - 60_000),
    permissions: { actions: 'write', metadata: 'read' } as const,
    status: 'active' as const,
};
const facts = { connected: true, grantedAgentIds: new Set(['agt_owner']) };
const trigger = {
    events: [{ actions: ['completed' as const], event: 'workflow_run' as const }],
    ownerAgentId: 'agt_owner',
    repositoryIds: [2],
};

describe('desiredProblem', () => {
    test('a healthy Trigger has no problem', () => {
        expect(desiredProblem(installation, facts, trigger, now)).toBeNull();
    });

    test('the most fundamental cause wins', () => {
        const stale = new Date(now.getTime() - githubAccessStaleMs - 1);
        expect(desiredProblem({ ...installation, status: 'removed' }, facts, trigger, now)).toBe(
            'installation_removed'
        );
        expect(desiredProblem({ ...installation, status: 'suspended' }, facts, trigger, now)).toBe(
            'installation_suspended'
        );
        expect(
            desiredProblem({ ...installation, accessSyncedAt: stale }, facts, trigger, now)
        ).toBe('sign_in_required');
        expect(desiredProblem(installation, { ...facts, connected: false }, trigger, now)).toBe(
            'sign_in_required'
        );
        expect(
            desiredProblem(installation, { ...facts, grantedAgentIds: new Set() }, trigger, now)
        ).toBe('agent_access_revoked');
        expect(
            desiredProblem(
                { ...installation, permissions: { metadata: 'read' } },
                facts,
                trigger,
                now
            )
        ).toBe('permissions_missing');
        expect(
            desiredProblem({ ...installation, accessibleRepositoryIds: [1] }, facts, trigger, now)
        ).toBe('repositories_unavailable');
    });

    test('a whole-installation Trigger never waits on a selected repository', () => {
        expect(
            desiredProblem(
                { ...installation, accessibleRepositoryIds: [] },
                facts,
                { ...trigger, repositoryIds: [] },
                now
            )
        ).toBeNull();
    });
});

test('a problem notice names the Trigger, the problem, and the fix', () => {
    const text = triggerProblemNoticeText({
        problem: 'permissions_missing',
        title: 'CI failed',
        triggerId: 'trg_one',
    });
    expect(text).toContain('Trigger paused: CI failed');
    expect(text).toContain('trg_one');
    expect(text).toContain('problem=permissions_missing');
    expect(text).toContain('Fix: ');
});

import { describe, expect, test } from 'bun:test';
import type { HausUpdateComputer, HausUpdateInput } from './haus-update-model.ts';
import { projectHausUpdate } from './haus-update-model.ts';
import { selectHausUpdateBatch } from './haus-update-reconciler.ts';
import { applyRunFailures } from './haus-update-run-failures.ts';
import { expectedComputerRestartMs } from './haus-update-timing.ts';
import { nextUpdateExpiry } from './use-offline-computers.ts';

const observedAt = Date.parse('2026-10-01T16:00:00.000Z');
const fresh = new Date(observedAt - 5000).toISOString();
const stale = new Date(observedAt - expectedComputerRestartMs).toISOString();
const input: HausUpdateInput = {
    computers: [],
    desktop: { currentVersion: '1.8.40', kind: 'desktop', phase: 'current' },
    observedAt,
    release: {
        components: {
            agent: '1.1.0',
            computer: '1.4.9',
            desktopApp: '1.8.40',
            ios: null,
            server: '1.8.38',
        },
        sourceRevision: 'a'.repeat(40),
        version: '1.9.0',
    },
};

describe('Haus update reachability', () => {
    test('fails a connected Computer that stops reporting progress and offers a retry', () => {
        for (const phase of ['requested', 'checking', 'downloading', 'installing'] as const) {
            const view = project([computer({ phase, updateUpdatedAt: stale })]);
            expect(view).toMatchObject({ phase: 'failed', primaryAction: { kind: 'retry' } });
            expect(view.steps[0]).toMatchObject({ connected: true, failedPhase: phase });
            expect(view.componentFacts[1]?.remedy).not.toBeNull();
        }
        expect(project([computer({ phase: 'requested', updateUpdatedAt: null })]).phase).toBe(
            'failed'
        );
    });

    test('keeps reporting Computers active, including a long wait for Agents', () => {
        for (const phase of ['requested', 'waiting-for-agents'] as const) {
            expect(project([computer({ phase, updateUpdatedAt: fresh })]).phase).toBe('updating');
        }
        expect(
            project([
                computer({ currentVersion: '1.4.9', phase: 'checking', updateUpdatedAt: stale }),
            ]).phase
        ).toBe('current');
    });

    test('wakes the updater when a connected update would stall', () => {
        const lastProgress = observedAt - 5000;
        expect(
            nextUpdateExpiry(
                [
                    {
                        health: 'healthy',
                        updatePhase: 'requested',
                        updateUpdatedAt: new Date(lastProgress).toISOString(),
                    },
                ],
                observedAt
            )
        ).toBe(lastProgress + expectedComputerRestartMs);
    });

    test('boots with an unreachable Computer without an update, batch, retry, or spinner', () => {
        for (const offline of [
            computer({ health: 'offline', phase: 'idle', updateUpdatedAt: null }),
            computer({ health: 'offline', phase: 'available' }),
            computer({ health: 'offline', phase: 'failed' }),
            computer({ health: 'offline', phase: 'checking', updateUpdatedAt: stale }),
            computer({
                health: 'offline',
                phase: 'requested',
                reportedTargetVersion: '1.4.8',
                updateUpdatedAt: stale,
            }),
        ]) {
            const view = project([offline]);
            expect(view).toMatchObject({ phase: 'current', primaryAction: null });
            expect(view.steps.filter((step) => step.kind === 'computer')).toEqual([]);
        }
        const persisted = project([
            computer({ health: 'offline', phase: 'requested', updateUpdatedAt: stale }),
        ]);
        expect(persisted).toMatchObject({ phase: 'failed', primaryAction: null });
        expect(persisted.steps[0]).toMatchObject({ connected: false, phase: 'failed' });
        expect(persisted.detail).toContain('Reconnect it');
        expect(selectHausUpdateBatch(persisted.steps).map((step) => step.kind)).toEqual([]);
        expect(
            applyRunFailures(persisted, {
                failures: [{ detail: 'Home did not finish updating.', stepId: 'cmp_home' }],
                kind: 'failed',
            })
        ).toBe(persisted);
    });

    test('never retries a run failure for a Computer that has since disconnected', () => {
        const view = project([
            computer({ health: 'offline', phase: 'downloading', updateUpdatedAt: fresh }),
        ]);
        const result = applyRunFailures(view, {
            failures: [{ detail: 'Home did not finish updating.', stepId: 'cmp_home' }],
            kind: 'failed',
        });

        expect(result).toBe(view);
        expect(result).toMatchObject({ phase: 'updating', primaryAction: null });
    });

    test('still offers a retry for a reachable Computer failure', () => {
        const view = project([computer({ phase: 'downloading', updateUpdatedAt: fresh })]);
        const result = applyRunFailures(view, {
            failures: [{ detail: 'Download failed.', stepId: 'cmp_home' }],
            kind: 'failed',
        });

        expect(result).toMatchObject({ phase: 'failed', primaryAction: { kind: 'retry' } });
    });

    test('offers the App update only when the native updater reports one', () => {
        for (const phase of ['idle', 'current'] as const) {
            const view = projectHausUpdate({
                ...input,
                desktop: { currentVersion: '1.8.39', kind: 'desktop', phase },
            });
            expect(view).toMatchObject({ phase: 'current', primaryAction: null, steps: [] });
            expect(view.componentFacts[0]).toMatchObject({ id: 'desktop-app', status: 'external' });
        }
        expect(
            projectHausUpdate({
                ...input,
                desktop: { currentVersion: '1.8.39', kind: 'desktop', phase: 'available' },
            }).primaryAction
        ).toEqual({ kind: 'start', label: 'Update' });
    });
});

function project(computers: HausUpdateComputer[]) {
    return projectHausUpdate({ ...input, computers });
}

function computer(overrides: Partial<HausUpdateComputer> = {}): HausUpdateComputer {
    return {
        currentVersion: '1.4.8',
        health: 'healthy',
        id: 'cmp_home',
        lastConnectedAt: '2026-10-01T15:00:00.000Z',
        name: 'Home',
        phase: 'available',
        reportedTargetVersion: '1.4.9',
        updateUpdatedAt: fresh,
        ...overrides,
    };
}

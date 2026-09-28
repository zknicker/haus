import { expect, test } from 'bun:test';
import type { ComputerUpdatePhase } from '@haus/api';
import { computerUpdateView } from './computer-update-model.ts';

test('presents every Computer update phase', () => {
    const phases: ComputerUpdatePhase[] = [
        'idle',
        'checking',
        'available',
        'requested',
        'downloading',
        'verifying',
        'installing',
        'waiting-for-agents',
        'restarting',
        'complete',
        'failed',
    ];
    expect(phases.map((phase) => computerUpdateView({ health: 'healthy', phase }).label)).toEqual([
        'Not checked',
        'Checking production release…',
        'Update available',
        'Download requested',
        'Downloading Haus Computer',
        'Verifying signature and integrity',
        'Installing update',
        'Waiting for active Agents…',
        'Restarting Haus Computer',
        'Update complete',
        'Update failed',
    ]);
});

test('keeps signed update available in update-required and disables ordinary offline state', () => {
    expect(computerUpdateView({ health: 'update-required', phase: 'available' })).toMatchObject({
        canCheck: true,
        canUpdate: true,
        needsLocalRecovery: true,
    });
    expect(computerUpdateView({ health: 'offline', phase: 'available' })).toMatchObject({
        canCheck: false,
        canUpdate: false,
        needsLocalRecovery: true,
    });
});

test('an in-flight update keeps reporting its phase after the Computer drops', () => {
    const observedAt = Date.parse('2026-09-28T16:00:00.000Z');
    const updateUpdatedAt = new Date(observedAt - 5000).toISOString();
    expect(
        computerUpdateView({
            health: 'offline',
            observedAt,
            phase: 'restarting',
            updateUpdatedAt,
        })
    ).toMatchObject({
        label: 'Restarting Haus Computer',
        needsLocalRecovery: false,
    });
    expect(
        computerUpdateView({
            health: 'offline',
            observedAt,
            phase: 'downloading',
            updateUpdatedAt,
        }).label
    ).toBe('Downloading Haus Computer');
});

test('stops indefinite progress when an offline Computer cannot confirm its update', () => {
    const observedAt = Date.parse('2026-09-28T16:00:00.000Z');
    for (const phase of ['requested', 'downloading', 'restarting'] as const) {
        expect(
            computerUpdateView({
                health: 'offline',
                observedAt,
                phase,
                updateUpdatedAt: new Date(observedAt - 120_000).toISOString(),
            })
        ).toMatchObject({
            canCheck: false,
            canUpdate: false,
            label: 'Update unconfirmed',
            needsLocalRecovery: true,
        });
    }
    expect(
        computerUpdateView({
            health: 'offline',
            observedAt,
            phase: 'restarting',
            updateUpdatedAt: new Date(observedAt - 120_000).toISOString(),
        }).detail
    ).toContain('confirm the installed version');
});

test('an offline Computer explains itself instead of leaving the card silent', () => {
    // Offline disables both controls, so the label is the only thing the card can
    // render; it previously fell through to an empty action slot.
    expect(computerUpdateView({ health: 'offline', phase: 'idle' })).toMatchObject({
        canCheck: false,
        canUpdate: false,
        label: 'Unavailable while offline',
    });
});

test('shows checking immediately while a Settings mutation is pending', () => {
    expect(
        computerUpdateView({ health: 'healthy', isChecking: true, phase: 'idle' })
    ).toMatchObject({
        canCheck: false,
        canUpdate: false,
        label: 'Checking production release…',
    });
});

test('distinguishes a current-version check from a completed update', () => {
    expect(
        computerUpdateView({
            health: 'healthy',
            phase: 'idle',
            targetVersion: '1.1.5',
        })
    ).toMatchObject({
        canCheck: true,
        canUpdate: false,
        label: 'Up to date',
    });
    expect(
        computerUpdateView({
            health: 'healthy',
            phase: 'complete',
            targetVersion: '1.1.5',
        })
    ).toMatchObject({
        label: 'Update complete',
    });
});

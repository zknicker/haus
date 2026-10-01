import { describe, expect, test } from 'bun:test';
import { gateComputersByPresence, readComputerPresenceCheck } from './computer-presence-gate.ts';
import type { HausUpdateComputer, HausUpdateInput } from './haus-update-model.ts';
import { projectHausUpdate } from './haus-update-model.ts';

const behindComputer: HausUpdateComputer = {
    currentVersion: '1.4.8',
    health: 'healthy',
    id: 'cmp_home',
    lastConnectedAt: '2026-10-01T15:00:00.000Z',
    name: 'Home',
    phase: 'available',
    reportedTargetVersion: '1.4.9',
    updateUpdatedAt: '2026-10-01T15:59:55.000Z',
};
const input: HausUpdateInput = {
    computers: [],
    desktop: { currentVersion: '1.8.39', kind: 'desktop', phase: 'available' },
    observedAt: Date.parse('2026-10-01T16:00:00.000Z'),
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

describe('Computer presence gate', () => {
    test('holds the whole updater hidden until the first presence check settles', () => {
        expect(gateComputersByPresence('pending', [behindComputer])).toBeNull();
    });

    test('offers Computer work once the presence check verifies it', () => {
        const computers = gateComputersByPresence('verified', [behindComputer]) ?? [];
        const view = projectHausUpdate({ ...input, computers: [...computers] });

        expect(view.steps.map((step) => step.kind)).toContain('computer');
    });

    test('a failed presence check offers no Computer work but keeps the App update', () => {
        const computers = gateComputersByPresence('failed', [behindComputer]);
        const view = projectHausUpdate({ ...input, computers: [...(computers ?? [])] });

        expect(computers).toEqual([]);
        expect(view.steps.map((step) => step.kind)).toEqual(['desktop-app']);
        expect(view.primaryAction).toEqual({ kind: 'start', label: 'Update' });
    });

    test('the first probe gates while in flight and reports its own failure', () => {
        expect(readComputerPresenceCheck({ hasVerified: false, status: 'pending' })).toBe(
            'pending'
        );
        expect(readComputerPresenceCheck({ hasVerified: false, status: 'error' })).toBe('failed');
        expect(readComputerPresenceCheck({ hasVerified: true, status: 'success' })).toBe(
            'verified'
        );
    });

    test('a refocus probe in flight after the first verify keeps the Computer steps', () => {
        const check = readComputerPresenceCheck({ hasVerified: true, status: 'pending' });
        const computers = gateComputersByPresence(check, [behindComputer]);
        const view = projectHausUpdate({ ...input, computers: [...(computers ?? [])] });

        expect(computers).toEqual([behindComputer]);
        expect(view.steps.map((step) => step.kind)).toContain('computer');
    });

    test('a failed refocus probe keeps the last verified Computers mid-run', () => {
        const updating = { ...behindComputer, phase: 'installing' as const };
        const check = readComputerPresenceCheck({ hasVerified: true, status: 'error' });
        const computers = gateComputersByPresence(check, [updating]);
        const view = projectHausUpdate({ ...input, computers: [...(computers ?? [])] });

        expect(check).toBe('verified');
        expect(view.steps.find((step) => step.kind === 'computer')?.phase).toBe('installing');
    });
});

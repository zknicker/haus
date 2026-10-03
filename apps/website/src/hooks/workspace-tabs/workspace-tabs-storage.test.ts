import { describe, expect, test } from 'bun:test';
import {
    emptyWorkspaceTabs,
    type WorkspaceArtifactTarget,
    type WorkspaceTabsState,
} from './workspace-tabs-model.ts';
import { workspaceTabsReducer } from './workspace-tabs-reducer.ts';
import {
    parseWorkspaceMode,
    parseWorkspaceTabs,
    readWorkspaceTabs,
    serializeWorkspaceTabs,
    writeWorkspaceTabs,
} from './workspace-tabs-storage.ts';

const report: WorkspaceArtifactTarget = {
    agentId: 'agent-1',
    kind: 'workspaceFile',
    path: 'reports/q3.html',
};
const reportKey = 'workspaceFile:agent-1:reports/q3.html';
const restoredEmpty: WorkspaceTabsState = { ...emptyWorkspaceTabs, sidePaneVisible: false };

describe('workspace tab persistence', () => {
    test('round-trips App-local tabs and their order without browser refs, the preview, or selection', () => {
        let state = [
            { kind: 'artifact', source: null, target: report, title: 'Q3 report' } as const,
            { kind: 'agent', agentId: 'blippy', section: 'skills' } as const,
            { kind: 'thread', anchorMessageId: 'm1', chatId: 'c1' } as const,
            { kind: 'thread', anchorMessageId: 'm2', chatId: 'c1' } as const,
        ].reduce(
            (current, tab) => workspaceTabsReducer(current, { kind: 'open', tab }),
            emptyWorkspaceTabs
        );
        // m1 was the preview until m2 replaced it; pinning m2 keeps it.
        state = workspaceTabsReducer(state, {
            kind: 'pin',
            ref: { kind: 'thread', anchorMessageId: 'm2', chatId: 'c1' },
        });
        state = workspaceTabsReducer(state, {
            kind: 'open',
            tab: { kind: 'thread', anchorMessageId: 'm3', chatId: 'c1' },
        });
        state = workspaceTabsReducer(state, {
            kind: 'reorder',
            order: [
                { kind: 'browser', id: 'b1' },
                { kind: 'agent', agentId: 'blippy' },
                { kind: 'artifact', key: reportKey },
                ...state.order.filter((ref) => ref.kind === 'thread'),
            ],
        });
        const restored = parseWorkspaceTabs(serializeWorkspaceTabs(state), 'expanded');
        expect(restored.active).toBeNull();
        expect(restored.preview).toBeNull();
        expect(restored.mode).toBe('expanded');
        expect(restored.sidePaneVisible).toBe(false);
        expect(restored.primarySelected).toBe(true);
        expect(restored.order).toEqual([
            { kind: 'agent', agentId: 'blippy' },
            { kind: 'artifact', key: reportKey },
            { kind: 'thread', anchorMessageId: 'm2', chatId: 'c1' },
        ]);
        expect(restored.artifacts).toEqual(state.artifacts);
        expect(restored.agents).toEqual([{ agentId: 'blippy', section: 'skills' }]);
        expect(restored.threads).toEqual([{ anchorMessageId: 'm2', chatId: 'c1' }]);
    });

    test('the mode is a per-device choice that defaults to split', () => {
        expect(parseWorkspaceMode('expanded')).toBe('expanded');
        expect(parseWorkspaceMode('split')).toBe('split');
        expect(parseWorkspaceMode(null)).toBe('split');
        expect(parseWorkspaceMode('nonsense')).toBe('split');
    });

    test('state saved before Agent and Thread tabs still restores', () => {
        const raw = JSON.stringify({
            artifacts: [{ key: reportKey, target: report, title: null, source: null }],
            order: [{ kind: 'primary' }, { kind: 'artifact', key: reportKey }],
        });
        const restored = parseWorkspaceTabs(raw);
        expect(restored.agents).toEqual([]);
        expect(restored.threads).toEqual([]);
        expect(restored.order).toEqual([{ kind: 'artifact', key: reportKey }]);
    });

    test('the split-era shape restores, its primary entry dropped', () => {
        const raw = JSON.stringify({
            agents: [{ agentId: 'tiny', section: 'home' }],
            artifacts: [],
            order: [
                { kind: 'agent', agentId: 'tiny' },
                { kind: 'primary' },
                { kind: 'thread', anchorMessageId: 'm1', chatId: 'c1' },
            ],
            threads: [{ anchorMessageId: 'm1', chatId: 'c1' }],
        });
        expect(parseWorkspaceTabs(raw).order).toEqual([
            { kind: 'agent', agentId: 'tiny' },
            { kind: 'thread', anchorMessageId: 'm1', chatId: 'c1' },
        ]);
    });

    test('drops malformed, unbound, and duplicate entries', () => {
        const raw = JSON.stringify({
            agents: [
                { agentId: 'blippy', section: 'nonsense' },
                { agentId: 'blippy', section: 'skills' },
                { agentId: '' },
                42,
            ],
            artifacts: [
                { target: report, title: 'Q3 report', source: null },
                { target: report, title: 'Duplicate', source: null },
                { target: { kind: 'workspaceFile', path: 'unbound.md' } },
                { target: { agentId: 'agent-1', kind: 'chart', path: 'x' } },
                'nonsense',
            ],
            order: [
                { kind: 'artifact', key: reportKey },
                { kind: 'artifact', key: 'missing' },
                { kind: 'agent', agentId: 'missing' },
                { kind: 'agent', agentId: 'blippy' },
                { kind: 'primary' },
                { kind: 'primary' },
                { kind: 'browser', id: 'b1' },
            ],
        });
        const restored = parseWorkspaceTabs(raw);
        expect(restored.artifacts.map((tab) => tab.title)).toEqual(['Q3 report']);
        expect(restored.agents).toEqual([{ agentId: 'blippy', section: 'home' }]);
        expect(restored.order).toEqual([
            { kind: 'artifact', key: reportKey },
            { kind: 'agent', agentId: 'blippy' },
        ]);
    });

    test('unreadable storage restores nothing', () => {
        expect(parseWorkspaceTabs('{not json')).toEqual(restoredEmpty);
        expect(parseWorkspaceTabs(null)).toEqual(restoredEmpty);
    });
});

describe('per-window persistence', () => {
    const store = () => {
        const values = new Map<string, string>();
        return {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => void values.set(key, value),
        };
    };
    const openAgent = (state: WorkspaceTabsState, agentId: string) =>
        workspaceTabsReducer(state, { kind: 'open', tab: { kind: 'agent', agentId } });
    const agentIds = (state: WorkspaceTabsState) => state.agents.map((tab) => tab.agentId);

    test('a tab one window closes never comes back in another window', () => {
        const local = store();
        const windowA = { local, session: store() };
        const windowB = { local, session: store() };
        // Both windows hold Blippy; A also holds Tiny.
        const a = openAgent(openAgent(readWorkspaceTabs(windowA, 's1', 'split'), 'blippy'), 'tiny');
        writeWorkspaceTabs(windowA, 's1', serializeWorkspaceTabs(a));
        let b = openAgent(readWorkspaceTabs(windowB, 's1', 'split'), 'blippy');
        writeWorkspaceTabs(windowB, 's1', serializeWorkspaceTabs(b));
        // B closes Blippy, then A changes something (and reloads).
        b = workspaceTabsReducer(b, { kind: 'close', ref: { kind: 'agent', agentId: 'blippy' } });
        writeWorkspaceTabs(windowB, 's1', serializeWorkspaceTabs(b));
        writeWorkspaceTabs(windowA, 's1', serializeWorkspaceTabs(a));
        expect(agentIds(readWorkspaceTabs(windowB, 's1', 'split'))).toEqual(['tiny']);
        expect(agentIds(readWorkspaceTabs(windowA, 's1', 'split'))).toEqual(['blippy', 'tiny']);
    });

    test('a window with no tabs of its own seeds from the last change; its own empty strip stays empty', () => {
        const local = store();
        const first = { local, session: store() };
        const tabs = openAgent(readWorkspaceTabs(first, 's1', 'split'), 'blippy');
        writeWorkspaceTabs(first, 's1', serializeWorkspaceTabs(tabs));
        // After a relaunch, the first window starts from the saved tabs.
        const relaunched = { local, session: store() };
        expect(agentIds(readWorkspaceTabs(relaunched, 's1', 'split'))).toEqual(['blippy']);
        // A window that closed every tab reloads empty rather than reseeding.
        const cleared = workspaceTabsReducer(tabs, {
            kind: 'close',
            ref: { kind: 'agent', agentId: 'blippy' },
        });
        writeWorkspaceTabs(first, 's1', serializeWorkspaceTabs(cleared));
        writeWorkspaceTabs(relaunched, 's1', serializeWorkspaceTabs(tabs));
        expect(agentIds(readWorkspaceTabs(first, 's1', 'split'))).toEqual([]);
        expect(readWorkspaceTabs(first, 's2', 'split').agents).toEqual([]);
    });
});

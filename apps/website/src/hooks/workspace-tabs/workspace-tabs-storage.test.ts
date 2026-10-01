import { describe, expect, test } from 'bun:test';
import {
    emptyWorkspaceTabs,
    mainAppTabs,
    primaryTabRef,
    resolveWorkspaceTabs,
    type WorkspaceArtifactTarget,
} from './workspace-tabs-model.ts';
import { workspaceTabsReducer } from './workspace-tabs-reducer.ts';
import { parseWorkspaceTabs, serializeWorkspaceTabs } from './workspace-tabs-storage.ts';

const report: WorkspaceArtifactTarget = {
    agentId: 'agent-1',
    kind: 'workspaceFile',
    path: 'reports/q3.html',
};
const reportKey = 'workspaceFile:agent-1:reports/q3.html';

describe('workspace tab persistence', () => {
    test('round-trips artifact and Agent tabs and the primary place without browser refs or selection', () => {
        let state = workspaceTabsReducer(emptyWorkspaceTabs, {
            kind: 'open',
            placement: 'auto',
            tab: { kind: 'artifact', source: null, target: report, title: 'Q3 report' },
        });
        state = workspaceTabsReducer(state, {
            kind: 'open',
            placement: 'auto',
            tab: { kind: 'agent', agentId: 'blippy', section: 'skills' },
        });
        state = workspaceTabsReducer(state, {
            kind: 'reorder',
            order: [
                { kind: 'browser', id: 'b1' },
                { kind: 'agent', agentId: 'blippy' },
                { kind: 'artifact', key: reportKey },
                primaryTabRef,
            ],
        });
        const restored = parseWorkspaceTabs(serializeWorkspaceTabs(state));
        expect(restored.mainActive).toBeNull();
        expect(restored.order).toEqual([
            { kind: 'agent', agentId: 'blippy' },
            { kind: 'artifact', key: reportKey },
            primaryTabRef,
        ]);
        expect(restored.artifacts).toEqual(state.artifacts);
        expect(restored.agents).toEqual([{ agentId: 'blippy', section: 'skills' }]);
    });

    test('split tabs persist folded onto the end of the main strip, split closed', () => {
        let state = workspaceTabsReducer(emptyWorkspaceTabs, { kind: 'openSplit' });
        state = workspaceTabsReducer(state, {
            kind: 'open',
            placement: 'auto',
            tab: { kind: 'agent', agentId: 'tiny' },
        });
        const restored = parseWorkspaceTabs(serializeWorkspaceTabs(state));
        expect(restored.split.open).toBe(false);
        expect(resolveWorkspaceTabs(restored.order, [], mainAppTabs(restored))).toEqual([
            primaryTabRef,
            { kind: 'agent', agentId: 'tiny' },
        ]);
    });

    test('state saved before Agent tabs and the split still restores', () => {
        const raw = JSON.stringify({
            artifacts: [{ key: reportKey, target: report, title: null, source: null }],
            order: [{ kind: 'artifact', key: reportKey }],
        });
        const restored = parseWorkspaceTabs(raw);
        expect(restored.agents).toEqual([]);
        expect(restored.split).toEqual(emptyWorkspaceTabs.split);
        expect(resolveWorkspaceTabs(restored.order, [], mainAppTabs(restored))).toEqual([
            primaryTabRef,
            { kind: 'artifact', key: reportKey },
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
            primaryTabRef,
        ]);
    });

    test('unreadable storage restores nothing', () => {
        expect(parseWorkspaceTabs('{not json')).toEqual(emptyWorkspaceTabs);
        expect(parseWorkspaceTabs(null)).toEqual(emptyWorkspaceTabs);
    });
});

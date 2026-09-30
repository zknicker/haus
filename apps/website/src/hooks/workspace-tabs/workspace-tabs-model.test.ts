import { describe, expect, test } from 'bun:test';
import {
    artifactTabLabel,
    emptyWorkspaceTabs,
    opensInWorkspaceTab,
    parseWorkspaceTabs,
    primaryTabRef,
    resolveWorkspaceTabs,
    selectionAfterClose,
    serializeWorkspaceTabs,
    type WorkspaceArtifactTarget,
    type WorkspaceTabRef,
    type WorkspaceTabsState,
    workspaceTabsReducer,
} from './workspace-tabs-model.ts';

const report: WorkspaceArtifactTarget = {
    agentId: 'agent-1',
    kind: 'workspaceFile',
    path: 'reports/q3.html',
};
const notes: WorkspaceArtifactTarget = {
    agentId: 'agent-1',
    kind: 'workspaceFile',
    path: 'notes.md',
};
const reportKey = 'workspaceFile:agent-1:reports/q3.html';
const notesKey = 'workspaceFile:agent-1:notes.md';

function open(
    state: WorkspaceTabsState,
    target: WorkspaceArtifactTarget,
    title: string | null = null
) {
    return workspaceTabsReducer(state, { kind: 'open', source: 'all', target, title });
}

describe('workspace tabs reducer', () => {
    test('opening appends a selected artifact tab', () => {
        const state = open(emptyWorkspaceTabs, report, 'Q3 report');
        expect(state.activeArtifactKey).toBe(reportKey);
        expect(state.order).toEqual([{ kind: 'artifact', key: reportKey }]);
        expect(artifactTabLabel(state.artifacts[0]!)).toBe('Q3 report');
    });

    test('opening an open artifact focuses its tab instead of adding one', () => {
        const state = workspaceTabsReducer(open(open(emptyWorkspaceTabs, report), notes), {
            kind: 'select',
            key: null,
        });
        const reopened = open(state, report);
        expect(reopened.artifacts).toHaveLength(2);
        expect(reopened.activeArtifactKey).toBe(reportKey);
    });

    test('the file name labels an untitled artifact', () => {
        expect(artifactTabLabel(open(emptyWorkspaceTabs, report).artifacts[0]!)).toBe('q3.html');
    });

    test('closing removes the tab and clears its selection', () => {
        const state = workspaceTabsReducer(open(open(emptyWorkspaceTabs, report), notes), {
            kind: 'close',
            key: notesKey,
        });
        expect(state.artifacts.map((tab) => tab.key)).toEqual([reportKey]);
        expect(state.order).toEqual([{ kind: 'artifact', key: reportKey }]);
        expect(state.activeArtifactKey).toBeNull();
    });

    test('selecting an unknown artifact is ignored', () => {
        const state = open(emptyWorkspaceTabs, report);
        expect(workspaceTabsReducer(state, { kind: 'select', key: 'missing' })).toBe(state);
    });
});

describe('workspace tab order', () => {
    test('persisted order interleaves kinds; new tabs append and stale refs drop', () => {
        const tabs = resolveWorkspaceTabs(
            [
                { kind: 'artifact', key: notesKey },
                primaryTabRef,
                { kind: 'browser', id: 'gone' },
                { kind: 'browser', id: 'b1' },
            ],
            ['b1', 'b2'],
            [reportKey, notesKey]
        );
        expect(tabs).toEqual([
            { kind: 'artifact', key: notesKey },
            primaryTabRef,
            { kind: 'browser', id: 'b1' },
            { kind: 'browser', id: 'b2' },
            { kind: 'artifact', key: reportKey },
        ]);
    });

    test('the primary tab leads an order that lacks it, and appears exactly once', () => {
        expect(resolveWorkspaceTabs([], [], [])).toEqual([primaryTabRef]);
        expect(resolveWorkspaceTabs([{ kind: 'browser', id: 'b1' }], ['b1'], [reportKey])).toEqual([
            primaryTabRef,
            { kind: 'browser', id: 'b1' },
            { kind: 'artifact', key: reportKey },
        ]);
        expect(
            resolveWorkspaceTabs(
                [{ kind: 'browser', id: 'b1' }, primaryTabRef, primaryTabRef],
                ['b1'],
                []
            )
        ).toEqual([{ kind: 'browser', id: 'b1' }, primaryTabRef]);
    });

    test('closing the selected tab selects the last remaining tab by strip position', () => {
        const b1 = { kind: 'browser', id: 'b1' } as const;
        const report = { kind: 'artifact', key: reportKey } as const;
        const notes = { kind: 'artifact', key: notesKey } as const;
        const leading: WorkspaceTabRef[] = [primaryTabRef, b1, report, notes];
        expect(selectionAfterClose(leading, notes)).toEqual(report);
        expect(selectionAfterClose(leading, b1)).toEqual(notes);
        expect(selectionAfterClose([primaryTabRef, report], report)).toEqual(primaryTabRef);
        // Moved last, the primary tab is the neighbor a closing tab hands selection to.
        expect(selectionAfterClose([b1, report, primaryTabRef], report)).toEqual(primaryTabRef);
    });
});

describe('workspace tab persistence', () => {
    test('round-trips artifact tabs and the primary place without browser refs or selection', () => {
        const state = workspaceTabsReducer(open(emptyWorkspaceTabs, report, 'Q3 report'), {
            kind: 'reorder',
            order: [
                { kind: 'browser', id: 'b1' },
                { kind: 'artifact', key: reportKey },
                primaryTabRef,
            ],
        });
        const restored = parseWorkspaceTabs(serializeWorkspaceTabs(state));
        expect(restored.activeArtifactKey).toBeNull();
        expect(restored.order).toEqual([{ kind: 'artifact', key: reportKey }, primaryTabRef]);
        expect(restored.artifacts).toEqual(state.artifacts);
    });

    test('a saved order without the primary tab restores with it first', () => {
        const raw = JSON.stringify({
            artifacts: [{ target: report, title: null, source: null }],
            order: [{ kind: 'artifact', key: reportKey }],
        });
        const restored = parseWorkspaceTabs(raw);
        expect(resolveWorkspaceTabs(restored.order, [], [reportKey])).toEqual([
            primaryTabRef,
            { kind: 'artifact', key: reportKey },
        ]);
    });

    test('drops malformed, unbound, and duplicate entries', () => {
        const raw = JSON.stringify({
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
                { kind: 'primary' },
                { kind: 'primary' },
                { kind: 'browser', id: 'b1' },
            ],
        });
        const restored = parseWorkspaceTabs(raw);
        expect(restored.artifacts.map((tab) => tab.title)).toEqual(['Q3 report']);
        expect(restored.order).toEqual([{ kind: 'artifact', key: reportKey }, primaryTabRef]);
    });

    test('unreadable storage restores nothing', () => {
        expect(parseWorkspaceTabs('{not json')).toEqual(emptyWorkspaceTabs);
        expect(parseWorkspaceTabs(null)).toEqual(emptyWorkspaceTabs);
    });
});

describe('artifact open routing', () => {
    test('desktop workspace tabs take Agent-bound artifacts', () => {
        expect(opensInWorkspaceTab(report, true)).toBe(true);
    });

    test('web keeps the Artifact Panel', () => {
        expect(opensInWorkspaceTab(report, false)).toBe(false);
    });

    test('an artifact without an Agent keeps the panel path', () => {
        expect(opensInWorkspaceTab({ kind: 'workspaceFile', path: 'x.md' }, true)).toBe(false);
    });
});

import { describe, expect, test } from 'bun:test';
import {
    type AppTabRef,
    emptyWorkspaceTabs,
    foldSplitIntoMain,
    openGroup,
    opensInWorkspaceTab,
    primaryTabRef,
    resolveWorkspaceTabs,
    selectionAfterClose,
    type WorkspaceArtifactTarget,
    type WorkspaceTabRef,
    type WorkspaceTabsState,
} from './workspace-tabs-model.ts';

const report: WorkspaceArtifactTarget = {
    agentId: 'agent-1',
    kind: 'workspaceFile',
    path: 'reports/q3.html',
};
const reportKey = 'workspaceFile:agent-1:reports/q3.html';
const notesKey = 'workspaceFile:agent-1:notes.md';
const reportRef: AppTabRef = { kind: 'artifact', key: reportKey };
const notesRef: AppTabRef = { kind: 'artifact', key: notesKey };
const blippy: AppTabRef = { kind: 'agent', agentId: 'blippy' };

describe('workspace tab order', () => {
    test('persisted order interleaves kinds; new tabs append and stale refs drop', () => {
        const tabs = resolveWorkspaceTabs(
            [
                notesRef,
                primaryTabRef,
                { kind: 'browser', id: 'gone' },
                { kind: 'browser', id: 'b1' },
            ],
            ['b1', 'b2'],
            [reportRef, notesRef, blippy]
        );
        expect(tabs).toEqual([
            notesRef,
            primaryTabRef,
            { kind: 'browser', id: 'b1' },
            { kind: 'browser', id: 'b2' },
            reportRef,
            blippy,
        ]);
    });

    test('the primary tab leads an order that lacks it, and appears exactly once', () => {
        expect(resolveWorkspaceTabs([], [], [])).toEqual([primaryTabRef]);
        expect(resolveWorkspaceTabs([{ kind: 'browser', id: 'b1' }], ['b1'], [reportRef])).toEqual([
            primaryTabRef,
            { kind: 'browser', id: 'b1' },
            reportRef,
        ]);
        expect(
            resolveWorkspaceTabs(
                [{ kind: 'browser', id: 'b1' }, primaryTabRef, primaryTabRef],
                ['b1'],
                []
            )
        ).toEqual([{ kind: 'browser', id: 'b1' }, primaryTabRef]);
    });

    test('a main order ref that is not a live main tab (a split tab) is dropped', () => {
        expect(resolveWorkspaceTabs([primaryTabRef, blippy], [], [reportRef])).toEqual([
            primaryTabRef,
            reportRef,
        ]);
    });

    test('closing the selected tab selects the last remaining tab by strip position', () => {
        const b1 = { kind: 'browser', id: 'b1' } as const;
        const leading: WorkspaceTabRef[] = [primaryTabRef, b1, reportRef, notesRef];
        expect(selectionAfterClose(leading, notesRef)).toEqual(reportRef);
        expect(selectionAfterClose(leading, b1)).toEqual(notesRef);
        expect(selectionAfterClose([primaryTabRef, reportRef], reportRef)).toEqual(primaryTabRef);
        // Moved last, the primary tab is the neighbor a closing tab hands selection to.
        expect(selectionAfterClose([b1, reportRef, primaryTabRef], reportRef)).toEqual(
            primaryTabRef
        );
    });
});

describe('split routing rule', () => {
    const state = (open: boolean, split: AppTabRef[] = []): WorkspaceTabsState => ({
        ...emptyWorkspaceTabs,
        agents: [{ agentId: 'blippy', section: 'home' }],
        artifacts: [{ key: reportKey, source: null, target: report, title: null }],
        split: { active: split[0] ?? null, open, order: split },
    });

    test('a new tab opens in the main strip while the split is closed', () => {
        expect(openGroup(state(false), notesRef, 'auto')).toBe('main');
    });

    test('a new tab opens in the split while it is open, even an empty one', () => {
        expect(openGroup(state(true), notesRef, 'auto')).toBe('split');
    });

    test('main placement forces the main strip', () => {
        expect(openGroup(state(true), notesRef, 'main')).toBe('main');
    });

    test('an open tab stays in its group', () => {
        expect(openGroup(state(true, [blippy]), blippy, 'main')).toBe('split');
        expect(openGroup(state(true, [blippy]), reportRef, 'auto')).toBe('main');
    });

    test('folding places split tabs right after the main selection', () => {
        const b1 = { kind: 'browser', id: 'b1' } as const;
        const main: WorkspaceTabRef[] = [primaryTabRef, b1, reportRef];
        expect(foldSplitIntoMain(main, b1, [blippy, notesRef])).toEqual([
            primaryTabRef,
            b1,
            blippy,
            notesRef,
            reportRef,
        ]);
        expect(foldSplitIntoMain(main, { kind: 'browser', id: 'gone' }, [blippy])).toEqual([
            ...main,
            blippy,
        ]);
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

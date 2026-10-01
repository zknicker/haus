import { describe, expect, test } from 'bun:test';
import {
    type AppTabRef,
    emptyWorkspaceTabs,
    type ThreadTabRef,
    type WorkspaceArtifactTarget,
    type WorkspaceTabsState,
    workspaceSelection,
} from './workspace-tabs-model.ts';
import { type WorkspaceTabsAction, workspaceTabsReducer } from './workspace-tabs-reducer.ts';

const report: WorkspaceArtifactTarget = {
    agentId: 'agent-1',
    kind: 'workspaceFile',
    path: 'reports/q3.html',
};
const reportRef: AppTabRef = { kind: 'artifact', key: 'workspaceFile:agent-1:reports/q3.html' };
const blippy: AppTabRef = { kind: 'agent', agentId: 'blippy' };
const thread = (anchorMessageId: string): ThreadTabRef => ({
    kind: 'thread',
    anchorMessageId,
    chatId: 'chat-1',
});
const one = thread('msg-1');
const two = thread('msg-2');
const three = thread('msg-3');

const openAgent = (agentId: string): WorkspaceTabsAction => ({
    kind: 'open',
    tab: { kind: 'agent', agentId },
});
const openThread = (ref: ThreadTabRef): WorkspaceTabsAction => ({ kind: 'open', tab: ref });
const openReport: WorkspaceTabsAction = {
    kind: 'open',
    tab: { kind: 'artifact', source: '#product', target: report, title: 'Q3' },
};

function run(start: Partial<WorkspaceTabsState>, ...actions: WorkspaceTabsAction[]) {
    return actions.reduce(workspaceTabsReducer, { ...emptyWorkspaceTabs, ...start });
}
const split = { mode: 'split' as const };
const expanded = { mode: 'expanded' as const };

describe('split mode', () => {
    test('opening a tab lands it in the side pane, selected, and focuses the pane', () => {
        const state = run(split, openAgent('blippy'), openReport);
        expect(state.order).toEqual([blippy, reportRef]);
        expect(state.active).toEqual(reportRef);
        expect(state.focus).toBe('side');
        expect(workspaceSelection(state, null, state.order).shownClosable).toEqual(reportRef);
    });

    test('opening an open tab selects it in place instead of duplicating it', () => {
        const state = run(split, openAgent('blippy'), openReport, openAgent('blippy'));
        expect(state.order).toEqual([blippy, reportRef]);
        expect(state.agents).toHaveLength(1);
        expect(state.active).toEqual(blippy);
    });

    test('hiding the pane keeps its tabs; the count is what it hides', () => {
        const state = run(split, openAgent('blippy'), openReport, {
            kind: 'sidePane',
            visible: false,
        });
        const shown = workspaceSelection(state, null, state.order);
        expect(shown.sidePaneShown).toBe(false);
        expect(state.order).toHaveLength(2);
        expect(state.active).toEqual(reportRef);
        expect(state.focus).toBe('primary');
    });

    test('opening a tab while the pane is hidden reveals it', () => {
        const hidden = run(split, openAgent('blippy'), { kind: 'sidePane', visible: false });
        expect(run(hidden, openReport).sidePaneVisible).toBe(true);
        expect(run(hidden, { kind: 'select', ref: blippy }).sidePaneVisible).toBe(true);
        // Electron selecting a browser page (a link, a new tab) reveals it too.
        const browser = run(hidden, { kind: 'selectBrowser' });
        expect(browser.sidePaneVisible).toBe(true);
        expect(browser.active).toBeNull();
    });

    test('selecting the routed page points Command-W at it and leaves the pane showing', () => {
        const state = run(split, openAgent('blippy'), { kind: 'selectPrimary' });
        expect(state.focus).toBe('primary');
        expect(workspaceSelection(state, null, state.order).shownClosable).toEqual(blippy);
    });
});

describe('expanded mode', () => {
    test('opening a tab selects it over the primary tab; selecting primary hides it', () => {
        const opened = run(expanded, openAgent('blippy'));
        expect(workspaceSelection(opened, null, opened.order).shownClosable).toEqual(blippy);
        const primary = run(opened, { kind: 'selectPrimary' });
        const shown = workspaceSelection(primary, null, primary.order);
        expect(shown.shownClosable).toBeNull();
        expect(shown.selectedClosable).toEqual(blippy);
    });

    test('closing the selected tab clears the selection for the shell to replace', () => {
        const state = run(expanded, openAgent('blippy'), openReport, {
            kind: 'close',
            ref: reportRef,
        });
        expect(state.order).toEqual([blippy]);
        expect(state.artifacts).toEqual([]);
        expect(state.active).toBeNull();
    });
});

describe('switching modes', () => {
    test('expanding from a shown side pane selects its tab; from a hidden one, the primary tab', () => {
        const shown = run(split, openAgent('blippy'), { kind: 'expand', showClosable: true });
        expect(shown.mode).toBe('expanded');
        expect(workspaceSelection(shown, null, shown.order).selectedTab).toEqual(blippy);
        const hidden = run(split, openAgent('blippy'), { kind: 'expand', showClosable: false });
        expect(workspaceSelection(hidden, null, hidden.order).shownClosable).toBeNull();
    });

    test('collapsing shows the side pane on the tab last selected, even behind the primary tab', () => {
        const state = run(
            expanded,
            openAgent('blippy'),
            openReport,
            { kind: 'select', ref: blippy },
            { kind: 'selectPrimary' },
            { kind: 'collapse' }
        );
        expect(state.mode).toBe('split');
        const shown = workspaceSelection(state, null, state.order);
        expect(shown.sidePaneShown).toBe(true);
        expect(shown.shownClosable).toEqual(blippy);
    });

    test('a hidden pane reopens on collapse', () => {
        const state = run(
            split,
            openAgent('blippy'),
            { kind: 'sidePane', visible: false },
            { kind: 'expand', showClosable: false },
            { kind: 'collapse' }
        );
        expect(workspaceSelection(state, null, state.order).sidePaneShown).toBe(true);
    });
});

describe('preview tabs', () => {
    for (const mode of [split, expanded]) {
        test(`a Thread opens as the preview tab, which the next Thread replaces in place (${mode.mode})`, () => {
            const state = run(mode, openAgent('blippy'), openThread(one), openThread(two));
            expect(state.order).toEqual([blippy, two]);
            expect(state.threads).toEqual([{ anchorMessageId: 'msg-2', chatId: 'chat-1' }]);
            expect(state.preview).toEqual(two);
            expect(state.active).toEqual(two);
        });

        test(`a pinned Thread stays; the next Thread opens beside it (${mode.mode})`, () => {
            const state = run(
                mode,
                openThread(one),
                { kind: 'pin', ref: one },
                openThread(two),
                openThread(three)
            );
            expect(state.order).toEqual([one, three]);
            expect(state.preview).toEqual(three);
        });
    }

    test('reopening an open preview Thread keeps it the preview', () => {
        const state = run(split, openThread(one), openAgent('blippy'), openThread(one));
        expect(state.preview).toEqual(one);
        expect(state.order).toEqual([one, blippy]);
        expect(state.active).toEqual(one);
    });

    test('a reopened Thread opens pinned', () => {
        const state = run(split, openThread(one), {
            kind: 'open',
            tab: { ...two, pinned: true },
        });
        expect(state.order).toEqual([one, two]);
        expect(state.preview).toEqual(one);
    });

    test('closing the preview tab leaves no preview; pinning anything else does nothing', () => {
        const opened = run(split, openThread(one), openAgent('blippy'));
        expect(run(opened, { kind: 'pin', ref: blippy })).toEqual(opened);
        const closed = run(opened, { kind: 'close', ref: one });
        expect(closed.preview).toBeNull();
        expect(closed.threads).toEqual([]);
    });
});

test('opening an Agent with a section moves its open tab to that section', () => {
    const state = run(split, openAgent('blippy'), {
        kind: 'open',
        tab: { kind: 'agent', agentId: 'blippy', section: 'skills' },
    });
    expect(state.agents).toEqual([{ agentId: 'blippy', section: 'skills' }]);
});

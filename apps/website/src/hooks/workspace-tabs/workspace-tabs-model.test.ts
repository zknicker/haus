import { describe, expect, test } from 'bun:test';
import {
    type AppTabRef,
    type ClosableTabRef,
    closeActiveTarget,
    emptyWorkspaceTabs,
    primaryTabRef,
    resolveClosableTabs,
    selectionAfterClose,
    syncBrowserOrder,
    visibleStrip,
    type WorkspaceTabsState,
    workspaceSelection,
} from './workspace-tabs-model.ts';

const blippy: AppTabRef = { kind: 'agent', agentId: 'blippy' };
const doc: AppTabRef = { kind: 'artifact', key: 'doc' };
const page: ClosableTabRef = { kind: 'browser', id: 'b1' };
const state = (patch: Partial<WorkspaceTabsState>): WorkspaceTabsState => ({
    ...emptyWorkspaceTabs,
    ...patch,
});

describe('closable tab order', () => {
    test('keeps placed refs that still exist, then appends unplaced live tabs', () => {
        expect(
            resolveClosableTabs(
                [doc, { kind: 'browser', id: 'gone' }, page, doc],
                ['b1', 'b2'],
                [doc, blippy]
            )
        ).toEqual([doc, page, { kind: 'browser', id: 'b2' }, blippy]);
    });

    test('the expanded strip leads with the primary tab; the split strip is closable tabs only', () => {
        expect(visibleStrip('expanded', [page, doc])).toEqual([primaryTabRef, page, doc]);
        expect(visibleStrip('split', [page, doc])).toEqual([page, doc]);
    });

    test('closing selects the last remaining tab, or nothing when none remains', () => {
        expect(selectionAfterClose([page, doc, blippy], blippy)).toEqual(doc);
        expect(selectionAfterClose([primaryTabRef, page], page)).toEqual(primaryTabRef);
        expect(selectionAfterClose([page], page)).toBeNull();
    });
});

describe('what the window shows', () => {
    test('split mode: the routed page always, and the side pane shows the selected tab', () => {
        const shown = workspaceSelection(state({ active: doc }), null, [doc]);
        expect(shown).toEqual({
            selectedClosable: doc,
            selectedTab: doc,
            shownClosable: doc,
            sidePaneShown: true,
        });
    });

    test('Electron’s selected browser tab is the selected closable tab, over an App tab', () => {
        expect(workspaceSelection(state({ active: doc }), 'b1', [doc, page]).shownClosable).toEqual(
            page
        );
    });

    test('a hidden side pane keeps its selection without showing it', () => {
        const hidden = workspaceSelection(state({ active: doc, sidePaneVisible: false }), null, [
            doc,
        ]);
        expect(hidden.sidePaneShown).toBe(false);
        expect(hidden.shownClosable).toBeNull();
        expect(hidden.selectedClosable).toEqual(doc);
    });

    test('a side pane with no tabs never shows', () => {
        expect(workspaceSelection(state({}), null, []).sidePaneShown).toBe(false);
    });

    test('expanded mode shows exactly one of the primary tab and the selected closable tab', () => {
        const expanded = state({ active: doc, mode: 'expanded', primarySelected: false });
        expect(workspaceSelection(expanded, null, [doc])).toEqual({
            selectedClosable: doc,
            selectedTab: doc,
            shownClosable: doc,
            sidePaneShown: false,
        });
        const primary = workspaceSelection({ ...expanded, primarySelected: true }, null, [doc]);
        expect(primary.selectedTab).toEqual(primaryTabRef);
        expect(primary.shownClosable).toBeNull();
        expect(primary.selectedClosable).toEqual(doc);
    });

    test('a selection whose tab is gone is no selection; a shown pane falls back to its last tab', () => {
        const hidden = state({ active: blippy, sidePaneVisible: false });
        expect(workspaceSelection(hidden, null, [doc]).selectedClosable).toBeNull();
        // Derived during render, so the pane never paints blank before the pick commits.
        const shown = workspaceSelection(state({ active: blippy }), null, [page, doc]);
        expect(shown.shownClosable).toEqual(doc);
        expect(shown.selectedTab).toEqual(doc);
        const covering = state({ mode: 'expanded', primarySelected: false });
        expect(workspaceSelection(covering, null, [page, doc]).shownClosable).toEqual(doc);
    });
});

describe('Command-W', () => {
    test('closes the tab on screen in either mode, wherever focus is', () => {
        const split = workspaceSelection(state({ active: doc }), null, [page, doc]);
        expect(closeActiveTarget(split, [page, doc])).toEqual({ close: doc, handled: true });
        const covering = state({ active: doc, mode: 'expanded', primarySelected: false });
        const expanded = workspaceSelection(covering, null, [doc]);
        expect(closeActiveTarget(expanded, [doc])).toEqual({ close: doc, handled: true });
    });

    test('with tabs open but none on screen it closes nothing and keeps the window', () => {
        const hidden = state({ active: doc, sidePaneVisible: false });
        expect(closeActiveTarget(workspaceSelection(hidden, null, [doc]), [doc])).toEqual({
            close: null,
            handled: true,
        });
        const primary = state({ active: doc, mode: 'expanded', primarySelected: true });
        expect(closeActiveTarget(workspaceSelection(primary, null, [doc]), [doc])).toEqual({
            close: null,
            handled: true,
        });
    });

    test('with no closable tab open the window closes', () => {
        expect(closeActiveTarget(workspaceSelection(state({}), null, []), [])).toEqual({
            close: null,
            handled: false,
        });
    });
});

describe('browser slots in the strip order', () => {
    test('new browser tabs append after everything placed; gone ones drop', () => {
        const order: ClosableTabRef[] = [page, doc];
        expect(syncBrowserOrder(order, ['b1', 'b2'])).toEqual([
            page,
            doc,
            { kind: 'browser', id: 'b2' },
        ]);
        expect(syncBrowserOrder(order, [])).toEqual([doc]);
        expect(syncBrowserOrder(order, ['b1'])).toBe(order);
    });

    test('an artifact opened after a browser tab lands after it', () => {
        const order = [...syncBrowserOrder([blippy], ['b1']), doc];
        expect(resolveClosableTabs(order, ['b1'], [blippy, doc])).toEqual([blippy, page, doc]);
    });
});

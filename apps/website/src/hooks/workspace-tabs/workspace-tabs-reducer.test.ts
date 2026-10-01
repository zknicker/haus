import { describe, expect, test } from 'bun:test';
import {
    type AppTabRef,
    artifactTabLabel,
    emptyWorkspaceTabs,
    primaryTabRef,
    type WorkspaceArtifactTarget,
    type WorkspaceTabsState,
} from './workspace-tabs-model.ts';
import { type WorkspaceTabsAction, workspaceTabsReducer } from './workspace-tabs-reducer.ts';

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
const reportRef: AppTabRef = { kind: 'artifact', key: 'workspaceFile:agent-1:reports/q3.html' };
const notesRef: AppTabRef = { kind: 'artifact', key: 'workspaceFile:agent-1:notes.md' };
const blippy: AppTabRef = { kind: 'agent', agentId: 'blippy' };
const tiny: AppTabRef = { kind: 'agent', agentId: 'tiny' };

function run(...actions: WorkspaceTabsAction[]): WorkspaceTabsState {
    return actions.reduce(workspaceTabsReducer, emptyWorkspaceTabs);
}
const openArtifact = (
    target: WorkspaceArtifactTarget,
    title: string | null = null
): WorkspaceTabsAction => ({
    kind: 'open',
    placement: 'auto',
    tab: { kind: 'artifact', source: 'all', target, title },
});
const openAgent = (
    agentId: string,
    extra: Partial<{ placement: 'auto' | 'main'; section: 'home' | 'skills' }> = {}
): WorkspaceTabsAction => ({
    kind: 'open',
    placement: extra.placement ?? 'auto',
    tab: { kind: 'agent', agentId, section: extra.section },
});

describe('artifact tabs', () => {
    test('opening appends a selected artifact tab', () => {
        const state = run(openArtifact(report, 'Q3 report'));
        expect(state.mainActive).toEqual(reportRef);
        expect(state.order).toEqual([reportRef]);
        expect(artifactTabLabel(state.artifacts[0]!)).toBe('Q3 report');
    });

    test('opening an open artifact focuses its tab instead of adding one', () => {
        const state = run(
            openArtifact(report),
            openArtifact(notes),
            { kind: 'select', ref: null },
            openArtifact(report)
        );
        expect(state.artifacts).toHaveLength(2);
        expect(state.mainActive).toEqual(reportRef);
    });

    test('the file name labels an untitled artifact', () => {
        expect(artifactTabLabel(run(openArtifact(report)).artifacts[0]!)).toBe('q3.html');
    });

    test('closing removes the tab and clears its selection', () => {
        const state = run(openArtifact(report), openArtifact(notes), {
            kind: 'close',
            ref: notesRef,
        });
        expect(state.artifacts.map((tab) => tab.key)).toEqual([reportRef.key]);
        expect(state.order).toEqual([reportRef]);
        expect(state.mainActive).toBeNull();
    });

    test('selecting an unknown tab is ignored', () => {
        const state = run(openArtifact(report));
        expect(workspaceTabsReducer(state, { kind: 'select', ref: notesRef })).toBe(state);
    });
});

describe('agent tabs', () => {
    test('an Agent opens once, at home, and reopening selects it with the asked section', () => {
        const state = run(openAgent('blippy'), { kind: 'select', ref: null });
        expect(state.agents).toEqual([{ agentId: 'blippy', section: 'home' }]);
        const again = workspaceTabsReducer(state, openAgent('blippy', { section: 'skills' }));
        expect(again.agents).toEqual([{ agentId: 'blippy', section: 'skills' }]);
        expect(again.mainActive).toEqual(blippy);
        expect(again.order).toEqual([blippy]);
    });

    test('drill-down changes only that tab section', () => {
        const state = run(openAgent('blippy'), openAgent('tiny'), {
            kind: 'section',
            agentId: 'tiny',
            section: 'automations',
        });
        expect(state.agents).toEqual([
            { agentId: 'blippy', section: 'home' },
            { agentId: 'tiny', section: 'automations' },
        ]);
    });
});

describe('split', () => {
    test('opening the split moves the selected main tab across and focuses it', () => {
        const state = run(openArtifact(report), openAgent('blippy'), { kind: 'openSplit' });
        expect(state.split).toEqual({ active: blippy, open: true, order: [blippy] });
        expect(state.mainActive).toBeNull();
        expect(state.order).toEqual([reportRef]);
        expect(state.focus).toBe('split');
    });

    test('with nothing to move the split opens empty and the next new tab lands there', () => {
        const state = run({ kind: 'openSplit' }, openAgent('blippy'));
        expect(state.split).toEqual({ active: blippy, open: true, order: [blippy] });
        expect(state.order).toEqual([]);
    });

    test('main placement opens in the main strip while the split is open', () => {
        const state = run(
            { kind: 'openSplit' },
            openAgent('tiny'),
            openAgent('blippy', { placement: 'main' })
        );
        expect(state.split.order).toEqual([tiny]);
        expect(state.order).toEqual([blippy]);
        expect(state.mainActive).toEqual(blippy);
        expect(state.focus).toBe('main');
    });

    test('selecting a split tab keeps the main selection', () => {
        const state = run(
            { kind: 'openSplit' },
            openAgent('tiny'),
            openAgent('blippy'),
            openArtifact(report, null),
            { kind: 'select', ref: tiny }
        );
        expect(state.split.active).toEqual(tiny);
        expect(state.mainActive).toBeNull();
    });

    test('closing a split tab selects its last neighbor; the last one closes the split', () => {
        const state = run({ kind: 'openSplit' }, openAgent('tiny'), openAgent('blippy'), {
            kind: 'close',
            ref: blippy,
        });
        expect(state.split).toEqual({ active: tiny, open: true, order: [tiny] });
        const closed = workspaceTabsReducer(state, { kind: 'close', ref: tiny });
        expect(closed.split.open).toBe(false);
        expect(closed.focus).toBe('main');
    });

    test('closing the split folds its tabs into the given main order', () => {
        const state = run({ kind: 'openSplit' }, openAgent('tiny'), {
            kind: 'closeSplit',
            order: [primaryTabRef, tiny],
        });
        expect(state.split).toEqual({ active: null, open: false, order: [] });
        expect(state.order).toEqual([primaryTabRef, tiny]);
        expect(state.agents).toHaveLength(1);
    });

    test('moving tabs between groups', () => {
        const toSplit = run(openArtifact(report), openArtifact(notes), {
            kind: 'moveToSplit',
            ref: reportRef,
        });
        expect(toSplit.split.order).toEqual([reportRef]);
        expect(toSplit.mainActive).toEqual(notesRef);
        const back = workspaceTabsReducer(toSplit, {
            kind: 'moveToMain',
            order: [primaryTabRef, reportRef, notesRef],
            ref: reportRef,
        });
        expect(back.split.open).toBe(false);
        expect(back.order).toEqual([primaryTabRef, reportRef, notesRef]);
        expect(back.mainActive).toEqual(reportRef);
    });

    test('a browser selection echoed by Electron after a split move keeps focus on the split', () => {
        // The moved tab's main neighbor is a browser tab: main selection is released
        // and focus goes to the split, then Electron reports the browser tab selected.
        const moved = run(
            openArtifact(report),
            { kind: 'openSplit' },
            { kind: 'select', ref: null },
            {
                kind: 'focus',
                group: 'split',
            }
        );
        const echoed = workspaceTabsReducer(moved, { kind: 'releaseMain' });
        expect(echoed.focus).toBe('split');
        expect(echoed.split.active).toEqual(reportRef);
        const covered = workspaceTabsReducer(
            run(openArtifact(notes), { kind: 'focus', group: 'split' }),
            { kind: 'releaseMain' }
        );
        expect(covered.mainActive).toBeNull();
        expect(covered.focus).toBe('split');
    });
});

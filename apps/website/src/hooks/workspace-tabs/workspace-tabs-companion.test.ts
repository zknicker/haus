import { describe, expect, test } from 'bun:test';
import {
    type AppTabRef,
    emptyWorkspaceTabs,
    openGroup,
    type ThreadTabRef,
    type WorkspaceTabsState,
} from './workspace-tabs-model.ts';
import { type WorkspaceTabsAction, workspaceTabsReducer } from './workspace-tabs-reducer.ts';
import { parseWorkspaceTabs, serializeWorkspaceTabs } from './workspace-tabs-storage.ts';

const thread = (anchorMessageId: string, chatId = 'chat-1'): ThreadTabRef => ({
    kind: 'thread',
    anchorMessageId,
    chatId,
});
const one = thread('msg-1');
const two = thread('msg-2');
const three = thread('msg-3');
const blippy: AppTabRef = { kind: 'agent', agentId: 'blippy' };

function run(...actions: WorkspaceTabsAction[]): WorkspaceTabsState {
    return actions.reduce(workspaceTabsReducer, emptyWorkspaceTabs);
}
const openThread = (
    ref: ThreadTabRef,
    placement: 'auto' | 'main' = 'auto'
): WorkspaceTabsAction => ({
    kind: 'open',
    placement,
    tab: ref,
});
const openAgent = (agentId: string): WorkspaceTabsAction => ({
    kind: 'open',
    placement: 'auto',
    tab: { kind: 'agent', agentId },
});

describe('companion placement', () => {
    test('a Thread opens in the split as its preview tab, opening a closed split', () => {
        const state = run(openAgent('blippy'), openThread(one));
        expect(state.split).toEqual({ active: one, open: true, order: [one], preview: one });
        expect(state.mainActive).toEqual(blippy);
        expect(state.order).toEqual([blippy]);
        expect(state.focus).toBe('split');
    });

    test('Cmd-click forces the main strip and opens the Thread pinned', () => {
        const state = run(openThread(one, 'main'));
        expect(state.order).toEqual([one]);
        expect(state.mainActive).toEqual(one);
        expect(state.split.open).toBe(false);
        expect(state.split.preview).toBeNull();
    });

    test('a page still follows the split rule; a companion ignores it', () => {
        expect(openGroup(emptyWorkspaceTabs, blippy, 'auto')).toBe('main');
        expect(openGroup(emptyWorkspaceTabs, one, 'auto')).toBe('split');
        expect(openGroup(emptyWorkspaceTabs, one, 'main')).toBe('main');
    });

    test('reopening an open Thread selects it where it is', () => {
        const state = run(openThread(one, 'main'), openThread(two), openThread(one));
        expect(state.mainActive).toEqual(one);
        expect(state.focus).toBe('main');
        expect(state.order).toEqual([one]);
        expect(state.split.order).toEqual([two]);
        expect(state.threads).toHaveLength(2);
    });
});

describe('preview tab', () => {
    test('the next companion replaces the preview tab in place', () => {
        const state = run(
            openAgent('blippy'),
            { kind: 'moveToSplit', ref: blippy },
            openThread(one),
            openAgent('tiny'),
            openThread(two)
        );
        expect(state.split.order).toEqual([blippy, two, { kind: 'agent', agentId: 'tiny' }]);
        expect(state.split.preview).toEqual(two);
        expect(state.split.active).toEqual(two);
        expect(state.threads).toEqual([{ anchorMessageId: 'msg-2', chatId: 'chat-1' }]);
    });

    test('selecting the open preview keeps it the preview', () => {
        const state = run(openThread(one), openAgent('blippy'), openThread(one));
        expect(state.split.preview).toEqual(one);
        expect(state.split.active).toEqual(one);
    });

    test('a pinned Thread stays; the next companion becomes the new preview beside it', () => {
        const state = run(openThread(one), { kind: 'pin', ref: one }, openThread(two));
        expect(state.split.order).toEqual([one, two]);
        expect(state.split.preview).toEqual(two);
        expect(run(openThread(one), { kind: 'pin', ref: one }).split.preview).toBeNull();
    });

    test('pinning a tab that is not the preview changes nothing', () => {
        const state = run(openThread(one), { kind: 'pin', ref: two });
        expect(state.split.preview).toEqual(one);
    });

    test('moving the preview to the main strip pins it', () => {
        const state = run(openThread(one), {
            kind: 'moveToMain',
            order: [one],
            ref: one,
        });
        expect(state.split.preview).toBeNull();
        expect(
            run(openThread(one), { kind: 'moveToMain', order: [one], ref: one }, openThread(two))
                .threads
        ).toHaveLength(2);
    });

    test('closing the split folds the preview into the main strip pinned', () => {
        const state = run(openThread(one), { kind: 'closeSplit', order: [one] });
        expect(state.order).toEqual([one]);
        expect(state.split.preview).toBeNull();
        expect(state.threads).toHaveLength(1);
    });

    test('closing the preview tab clears the preview', () => {
        const state = run(openThread(one), openThread(two, 'main'), { kind: 'close', ref: one });
        expect(state.split.preview).toBeNull();
        expect(state.threads).toEqual([{ anchorMessageId: 'msg-2', chatId: 'chat-1' }]);
        const after = workspaceTabsReducer(state, openThread(three));
        expect(after.split).toEqual({ active: three, open: true, order: [three], preview: three });
    });

    test('identity is the chat plus the Thread anchor', () => {
        const state = run(
            openThread(one),
            { kind: 'pin', ref: one },
            openThread(thread('msg-1', 'chat-2'))
        );
        expect(state.split.order).toHaveLength(2);
    });
});

describe('Thread tab persistence', () => {
    test('only pinned Thread tabs persist', () => {
        const state = run(
            openThread(one, 'main'),
            openThread(two),
            { kind: 'pin', ref: two },
            openThread(three)
        );
        const restored = parseWorkspaceTabs(serializeWorkspaceTabs(state));
        expect(restored.threads).toEqual([
            { anchorMessageId: 'msg-1', chatId: 'chat-1' },
            { anchorMessageId: 'msg-2', chatId: 'chat-1' },
        ]);
        expect(restored.order).toEqual([one, two]);
        expect(restored.split.open).toBe(false);
    });

    test('state saved before Thread tabs existed still parses', () => {
        const restored = parseWorkspaceTabs(
            JSON.stringify({
                agents: [{ agentId: 'blippy', section: 'home' }],
                artifacts: [],
                order: [{ kind: 'primary' }, { kind: 'agent', agentId: 'blippy' }],
            })
        );
        expect(restored.threads).toEqual([]);
        expect(restored.order).toEqual([{ kind: 'primary' }, blippy]);
    });

    test('malformed Thread entries are dropped', () => {
        const restored = parseWorkspaceTabs(
            JSON.stringify({
                artifacts: [],
                order: [{ kind: 'thread', chatId: 'chat-1' }, one],
                threads: [{ chatId: 'chat-1' }, { anchorMessageId: '', chatId: 'c' }, one, one],
            })
        );
        expect(restored.threads).toEqual([{ anchorMessageId: 'msg-1', chatId: 'chat-1' }]);
        expect(restored.order).toEqual([one]);
    });
});

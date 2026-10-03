import { expect, test } from 'bun:test';
import { closedTabEntry } from './closed-tabs.ts';
import {
    emptyWorkspaceTabs,
    type FilesTabRef,
    hasAppTab,
    workspaceTabId,
} from './workspace-tabs-model.ts';
import { workspaceTabsReducer } from './workspace-tabs-reducer.ts';
import { parseWorkspaceTabs, serializeWorkspaceTabs } from './workspace-tabs-storage.ts';

const files: FilesTabRef = { kind: 'files', chatId: 'chat-1' };
const openFiles = (chatId: string) => ({ kind: 'open', tab: { kind: 'files', chatId } }) as const;

test('a chat has one Files tab, identified by its chat', () => {
    expect(workspaceTabId(files)).toBe('files:chat-1');

    const once = workspaceTabsReducer(emptyWorkspaceTabs, openFiles('chat-1'));
    const twice = workspaceTabsReducer(once, openFiles('chat-1'));

    expect(twice.files).toEqual([{ chatId: 'chat-1' }]);
    expect(twice.order).toEqual([files]);
    expect(twice.active).toEqual(files);
    expect(twice.sidePaneVisible).toBe(true);
});

test('another chat opens its own Files tab beside it', () => {
    const state = workspaceTabsReducer(
        workspaceTabsReducer(emptyWorkspaceTabs, openFiles('chat-1')),
        openFiles('chat-2')
    );

    expect(state.order.map(workspaceTabId)).toEqual(['files:chat-1', 'files:chat-2']);
});

test('closing a Files tab drops it and remembers it for Reopen Closed Tab', () => {
    const open = workspaceTabsReducer(emptyWorkspaceTabs, openFiles('chat-1'));

    expect(closedTabEntry(files, open.order, [], [])).toEqual({
        kind: 'files',
        index: 0,
        tab: { chatId: 'chat-1' },
    });

    const closed = workspaceTabsReducer(open, { kind: 'close', ref: files });
    expect(hasAppTab(closed, files)).toBe(false);
    expect(closed.order).toEqual([]);
    expect(closed.active).toBeNull();
});

test('Files tabs persist and restore in strip order', () => {
    const open = [openFiles('chat-1'), openFiles('chat-2')].reduce(
        workspaceTabsReducer,
        emptyWorkspaceTabs
    );
    const restored = parseWorkspaceTabs(serializeWorkspaceTabs(open));

    expect(restored.files).toEqual([{ chatId: 'chat-1' }, { chatId: 'chat-2' }]);
    expect(restored.order.map(workspaceTabId)).toEqual(['files:chat-1', 'files:chat-2']);
    expect(restored.active).toBeNull();
});

test('restoring drops malformed and duplicate Files tabs and orphaned order entries', () => {
    const restored = parseWorkspaceTabs(
        JSON.stringify({
            artifacts: [],
            files: [{ chatId: 'chat-1' }, { chatId: '' }, { chatId: 'chat-1' }, null],
            order: [files, { kind: 'files', chatId: 'chat-9' }, { kind: 'files' }],
        })
    );

    expect(restored.files).toEqual([{ chatId: 'chat-1' }]);
    expect(restored.order).toEqual([files]);
});

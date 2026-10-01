import { expect, test } from 'bun:test';
import type { BrowserTab } from '../../lib/desktop-browser.ts';
import {
    type ClosedTab,
    closedTabEntry,
    closedTabLimit,
    insertTabAt,
    rememberClosedTab,
} from './closed-tabs.ts';
import {
    type ArtifactTab,
    type ClosableTabRef,
    primaryTabRef,
    type WorkspaceTabRef,
    workspaceTabId,
} from './workspace-tabs-model.ts';

const page = (id: string, url: string): BrowserTab => ({
    canGoBack: false,
    canGoForward: false,
    error: null,
    faviconUrl: 'https://example.com/favicon.ico',
    find: null,
    id,
    loading: false,
    title: id,
    url,
    zoomFactor: 1,
});
const artifact = {
    key: 'doc',
    source: '#product',
    target: { kind: 'file', path: 'notes.md', agentId: 'agent' },
    title: 'Notes',
} as unknown as ArtifactTab;
const closable: ClosableTabRef[] = [
    { kind: 'browser', id: 'a' },
    { kind: 'artifact', key: 'doc' },
    { kind: 'browser', id: 'blank' },
];
const strip: WorkspaceTabRef[] = [primaryTabRef, ...closable];
const pages = [page('a', 'https://example.com/a'), page('blank', 'about:blank')];

test('closing remembers a page or artifact at its whole-strip position, skipping blank pages', () => {
    expect(closedTabEntry(closable[0]!, strip, pages, [artifact])).toEqual({
        kind: 'browser',
        index: 1,
        url: 'https://example.com/a',
        title: 'a',
        faviconUrl: 'https://example.com/favicon.ico',
    });
    expect(closedTabEntry(closable[1]!, strip, pages, [artifact])).toEqual({
        kind: 'artifact',
        index: 2,
        tab: artifact,
    });
    expect(closedTabEntry(closable[2]!, strip, pages, [artifact])).toBeNull();
    expect(closedTabEntry({ kind: 'browser', id: 'gone' }, strip, pages, [])).toBeNull();
});

test('the stack keeps the newest closed tabs up to the cap', () => {
    let stack: ClosedTab[] = [];
    for (let index = 0; index < closedTabLimit + 5; index++) {
        stack = rememberClosedTab(stack, { kind: 'artifact', index, tab: artifact });
    }
    expect(stack).toHaveLength(closedTabLimit);
    expect(stack.at(-1)?.index).toBe(closedTabLimit + 4);
    expect(stack[0]?.index).toBe(5);
});

test('reopened tabs return to their index, clamped to the current strip', () => {
    const ref: WorkspaceTabRef = { kind: 'browser', id: 'new' };
    expect(insertTabAt(strip, ref, 2).map(workspaceTabId)).toEqual([
        'primary',
        'browser:a',
        'browser:new',
        'artifact:doc',
        'browser:blank',
    ]);
    expect(insertTabAt(strip, ref, 99).at(-1)).toEqual(ref);
    expect(insertTabAt([], ref, 3)).toEqual([ref]);
    expect(insertTabAt([...strip, ref], ref, 0)[0]).toEqual(ref);
});

test('closing an Agent tab remembers its section; a split tab indexes after the main strip', () => {
    const agent = { agentId: 'blippy', section: 'skills' } as const;
    const ref: ClosableTabRef = { kind: 'agent', agentId: 'blippy' };
    expect(closedTabEntry(ref, [...strip, ref], pages, [artifact], [agent])).toEqual({
        kind: 'agent',
        index: strip.length,
        tab: agent,
    });
    expect(closedTabEntry(ref, strip, pages, [artifact], [agent])).toBeNull();
});

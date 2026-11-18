import { describe, expect, it } from 'bun:test';
import {
    openInNewTabKey,
    openOnRightKey,
    rowTabOpeners,
    runRowTabItem,
} from './open-in-new-tab-item.tsx';

describe('a sidebar row menu’s tab items', () => {
    it('are absent on the web, which has no tabs', () => {
        expect(rowTabOpeners(null)).toBeNull();
        expect(runRowTabItem(null, openInNewTabKey, '/s/demo/chats/c1')).toBe(false);
    });

    it('Open in new tab is a background tab after the left pane’s tab; Open on the right is Open', () => {
        const calls: unknown[][] = [];
        const openers = rowTabOpeners({
            open: (...args) => calls.push(['open', ...args]),
            openTab: (...args) => calls.push(['openTab', ...args]),
        });
        const chat = { kind: 'app', path: '/s/demo/chats/c1' };
        expect(runRowTabItem(openers, openInNewTabKey, chat.path)).toBe(true);
        expect(runRowTabItem(openers, openOnRightKey, chat.path)).toBe(true);
        expect(runRowTabItem(openers, 'rename', chat.path)).toBe(false);
        expect(calls).toEqual([
            ['openTab', null, chat, { background: true }],
            ['open', null, chat],
        ]);
    });
});

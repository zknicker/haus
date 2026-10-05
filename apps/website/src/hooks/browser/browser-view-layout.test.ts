import { expect, test } from 'bun:test';
import type { BrowserViewPlacement } from '../../lib/desktop-browser.ts';
import { createBrowserViewLayout } from './browser-view-layout.ts';

const left = { x: 0, y: 40, width: 400, height: 600 };
const right = { x: 400, y: 40, width: 400, height: 600 };

test('every change sends both panes’ placements, and a hidden view drops out', async () => {
    const sent: (readonly BrowserViewPlacement[])[] = [];
    const layout = createBrowserViewLayout(async (placements) => {
        sent.push(placements);
    });
    await layout.place('a', left);
    await layout.place('b', right);
    await layout.focus('b');
    await layout.place('a', null);
    await layout.place('a', null);
    expect(sent).toEqual([
        [{ viewId: 'a', bounds: left, focused: false }],
        [
            { viewId: 'a', bounds: left, focused: false },
            { viewId: 'b', bounds: right, focused: false },
        ],
        [
            { viewId: 'a', bounds: left, focused: false },
            { viewId: 'b', bounds: right, focused: true },
        ],
        [{ viewId: 'b', bounds: right, focused: true }],
    ]);
});

test('focus marks only placed views and blur leaves another page’s mark alone', async () => {
    const sent: (readonly BrowserViewPlacement[])[] = [];
    const layout = createBrowserViewLayout(async (placements) => {
        sent.push(placements);
    });
    await layout.focus('a');
    expect(sent).toEqual([]);
    await layout.place('a', left);
    expect(sent.at(-1)).toEqual([{ viewId: 'a', bounds: left, focused: true }]);
    await layout.blur('b');
    expect(sent).toHaveLength(1);
    await layout.blur('a');
    expect(sent.at(-1)).toEqual([{ viewId: 'a', bounds: left, focused: false }]);
});

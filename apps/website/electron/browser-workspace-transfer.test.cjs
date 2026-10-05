'use strict';

const { expect, test } = require('bun:test');
const { registerBrowserWorkspace } = require('./browser-workspace-ipc.cjs');
const { FakeView, fixture, page } = require('./browser-test-fakes.cjs');

test('a tab drag never moves pages into a window at its view limit', () => {
    const registration = registerBrowserWorkspace({
        appUrl: 'https://haus.chat',
        BrowserWindow: { fromWebContents: () => null },
        WebContentsView: FakeView,
        ipcMain: { handle: () => undefined },
        page: page(),
        session: {
            fromPartition: () => ({
                on: () => undefined,
                setPermissionCheckHandler: () => undefined,
                setPermissionRequestHandler: () => undefined,
            }),
        },
    });
    const from = fixture().window;
    const to = fixture().window;
    const source = registration.attach(from);
    const target = registration.attach(to);
    source.command({ kind: 'mount' });
    target.command({ kind: 'mount' });
    source.command({ kind: 'open', url: 'https://example.com', viewId: 'moving' });
    for (let index = 0; index < 20; index += 1) {
        target.command({ kind: 'open', url: 'https://example.org', viewId: `full-${index}` });
    }
    expect(registration.canTransfer(from, to, ['moving'])).toBe(false);
    registration.transfer(from, to, ['moving']);
    expect(source.has('moving')).toBe(true);
    expect(target.has('moving')).toBe(false);
    target.command({ kind: 'close', id: 'full-0' });
    expect(registration.canTransfer(from, to, ['moving'])).toBe(true);
    registration.transfer(from, to, ['moving']);
    expect(target.has('moving')).toBe(true);
});

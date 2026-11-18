import { expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import {
    installEnterToOpenUrl,
    openUrlInBrowser,
    type SpawnBrowserProcess,
} from './browser-handoff.ts';

test('opens a verification URL with the native macOS browser command', () => {
    const calls: unknown[][] = [];
    let unrefCalled = false;
    const spawn = ((...args: unknown[]) => {
        calls.push(args);
        return {
            on() {
                return this;
            },
            unref() {
                unrefCalled = true;
            },
        };
    }) as SpawnBrowserProcess;

    openUrlInBrowser('https://haus.chat/computer/login?code=ABCD-EFGH', {
        platform: 'darwin',
        spawn,
    });

    expect(calls).toEqual([
        [
            'open',
            ['https://haus.chat/computer/login?code=ABCD-EFGH'],
            { detached: true, stdio: 'ignore', windowsHide: true },
        ],
    ]);
    expect(unrefCalled).toBe(true);
});

test('Enter retries the browser handoff only for an interactive terminal', () => {
    const input = Object.assign(new EventEmitter(), {
        isTTY: true,
        pause() {},
        resume() {},
    });
    const opened: string[] = [];
    const cleanup = installEnterToOpenUrl({
        input,
        openUrl: (url) => opened.push(url),
        url: 'https://haus.chat/computer/login?code=ABCD-EFGH',
    });

    input.emit('data', Buffer.from('not yet'));
    expect(opened).toEqual([]);
    input.emit('data', Buffer.from('\n'));
    expect(opened).toEqual(['https://haus.chat/computer/login?code=ABCD-EFGH']);
    input.emit('data', Buffer.from('\n'));
    expect(opened).toHaveLength(1);
    cleanup();
});

test('a non-interactive input never installs an Enter retry', () => {
    let resumed = false;
    const input = Object.assign(new EventEmitter(), {
        isTTY: false,
        pause() {},
        resume() {
            resumed = true;
        },
    });
    const opened: string[] = [];
    installEnterToOpenUrl({
        input,
        openUrl: (url) => opened.push(url),
        url: 'https://haus.chat/computer/login?code=ABCD-EFGH',
    });

    input.emit('data', Buffer.from('\n'));
    expect(input.listenerCount('data')).toBe(0);
    expect(opened).toEqual([]);
    expect(resumed).toBe(false);
});

import { expect, test } from 'bun:test';
import fs from 'node:fs';
import type { CdpClient } from './cdp.ts';
import { type ChromeProcessDeps, chromeArgs, launchHeadlessChrome } from './chrome.ts';

function fakeProcess(options: { connect?: () => Promise<CdpClient>; port?: boolean } = {}) {
    const state = { args: [] as string[], cdpClosed: false, killed: false };
    let exit: (code: number) => void = () => {};
    const exited = new Promise<number>((resolve) => {
        exit = resolve;
    });
    const deps: ChromeProcessDeps = {
        connect:
            options.connect ??
            (() =>
                Promise.resolve({
                    close: () => {
                        state.cdpClosed = true;
                    },
                    on: () => () => {},
                    send: () => Promise.resolve({}),
                })),
        readActivePort: () =>
            options.port === false ? null : { port: 9222, webSocketPath: '/devtools/browser/abc' },
        spawn(_executable, args) {
            state.args = args;
            return {
                exited,
                kill: () => {
                    state.killed = true;
                    exit(0);
                },
            };
        },
    };
    return { deps, state };
}

function profileDir(args: string[]): string {
    const flag = args.find((arg) => arg.startsWith('--user-data-dir='));
    return flag?.slice('--user-data-dir='.length) ?? '';
}

test('every launch gets a throwaway profile that close removes with the process', async () => {
    const { deps, state } = fakeProcess();
    const chrome = await launchHeadlessChrome('/fake/chrome', deps);
    const dir = profileDir(state.args);

    expect(dir).toContain('haus-visual-preview-');
    expect(fs.existsSync(dir)).toBe(true);
    expect(state.args).toContain('--headless=new');
    expect(state.args).toContain('--remote-debugging-port=0');

    await chrome.close();
    expect(state.cdpClosed).toBe(true);
    expect(state.killed).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
});

test('a failed connection still kills Chrome and removes the profile', async () => {
    const { deps, state } = fakeProcess({
        connect: () => Promise.reject(new Error('refused')),
    });
    await expect(launchHeadlessChrome('/fake/chrome', deps)).rejects.toThrow(
        'Headless Chrome did not start: refused'
    );
    expect(state.killed).toBe(true);
    expect(fs.existsSync(profileDir(state.args))).toBe(false);
});

test('Chrome exiting before it opens a DevTools port is reported, not waited out', async () => {
    const { deps, state } = fakeProcess({ port: false });
    const spawn = deps.spawn;
    deps.spawn = (executable, args) => {
        const child = spawn(executable, args);
        child.kill();
        return child;
    };
    await expect(launchHeadlessChrome('/fake/chrome', deps)).rejects.toThrow(
        'Chrome exited with code 0.'
    );
    expect(fs.existsSync(profileDir(state.args))).toBe(false);
});

test('a Chrome that ignores SIGTERM is SIGKILLed before the profile goes', async () => {
    const { deps, state } = fakeProcess();
    const signals: (string | undefined)[] = [];
    let exit: (code: number) => void = () => {};
    const exited = new Promise<number>((resolve) => {
        exit = resolve;
    });
    deps.exitGraceMs = 20;
    deps.spawn = (_executable, args) => {
        state.args = args;
        return {
            exited,
            kill: (signal) => {
                signals.push(signal);
                if (signal === 'SIGKILL') {
                    exit(137);
                }
            },
        };
    };
    const chrome = await launchHeadlessChrome('/fake/chrome', deps);
    await chrome.close();

    expect(signals).toEqual([undefined, 'SIGKILL']);
    expect(fs.existsSync(profileDir(state.args))).toBe(false);
});

test('close releases the signal handlers it installed', async () => {
    const before = process.listenerCount('SIGTERM');
    const { deps } = fakeProcess();
    const chrome = await launchHeadlessChrome('/fake/chrome', deps);
    expect(process.listenerCount('SIGTERM')).toBe(before + 1);
    await chrome.close();
    expect(process.listenerCount('SIGTERM')).toBe(before);
});

test('the profile flag only ever names the throwaway directory', () => {
    const args = chromeArgs('/tmp/haus-visual-preview-x');
    expect(args.filter((arg) => arg.startsWith('--user-data-dir'))).toEqual([
        '--user-data-dir=/tmp/haus-visual-preview-x',
    ]);
    expect(args.some((arg) => arg.startsWith('--profile-directory'))).toBe(false);
});

test('Chrome never reaches for the macOS Keychain', () => {
    const args = chromeArgs('/tmp/haus-visual-preview-x');
    expect(args).toContain('--use-mock-keychain');
    expect(args).toContain('--password-store=basic');
});

import { expect, test } from 'bun:test';
import { ExistingBrowserConnection } from './existing-browser.ts';
import type { ProcessRecord } from './types.ts';

const contract = {
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: '/shared/profile',
};
const process: ProcessRecord = {
    command: `${contract.executablePath} --user-data-dir=${contract.userDataDir} --remote-debugging-port=0`,
    cpuPercent: 1,
    elapsedSeconds: 20,
    parentPid: 1,
    pid: 123,
    rssBytes: 100,
};

test('observes external browser recovery without lifecycle controls', async () => {
    const records = [process];
    const connection = new ExistingBrowserConnection(
        contract,
        '153',
        { read: async () => records },
        {
            probe: async () => ({ state: 'healthy', latencyMs: 1 }),
            attachment: async () => ({
                port: 1234,
                webSocketDebuggerUrl: 'ws://127.0.0.1:1234/devtools/browser/one',
            }),
        }
    );
    expect(await connection.status()).toMatchObject({
        state: 'healthy',
        pid: 123,
    });
    records.splice(0);
    expect(await connection.status()).toMatchObject({ state: 'degraded', pid: null });
    records.push({ ...process, pid: 456 });
    expect(await connection.status()).toMatchObject({ state: 'healthy', pid: 456 });
});

test('a stale endpoint cannot connect Haus to a different profile process', async () => {
    let probes = 0;
    const connection = new ExistingBrowserConnection(
        contract,
        '153',
        {
            read: async () => [
                {
                    ...process,
                    command: process.command.replace('/shared/profile ', '/shared/profile-other '),
                },
            ],
        },
        {
            probe: async () => {
                probes++;
                return { state: 'healthy', latencyMs: 1 };
            },
            attachment: async () => {
                throw new Error('unexpected');
            },
        }
    );
    expect(await connection.status()).toMatchObject({ state: 'degraded', running: false });
    expect(probes).toBe(0);
});

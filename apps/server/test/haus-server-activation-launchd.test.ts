import { expect, test } from 'bun:test';
import { startProductionServer, stopProductionServer } from '../src/haus-server-activation.ts';

const serverLabel = 'system/com.haus.server';
const serverPlist = '/Library/LaunchDaemons/com.haus.server.plist';

test('bootstraps the exact Server plist when launchd reports the label is unloaded', async () => {
    const commands: string[][] = [];
    const results = [
        {
            exitCode: 113,
            stderr: 'Could not find service "com.haus.server" in domain for system',
            stdout: '',
        },
        { exitCode: 0, stderr: '', stdout: '' },
    ];

    const activation = await startProductionServer(
        (args) => {
            commands.push(args);
            return results.shift() ?? { exitCode: 0, stderr: '', stdout: '' };
        },
        async (path) => ({
            mode: path === serverPlist ? 0o10_0644 : 0o04_0755,
            uid: 0,
        })
    );

    expect(activation).toEqual({ introducedLabel: true, previousPid: null });
    expect(commands).toEqual([
        ['print', serverLabel],
        ['bootstrap', 'system', serverPlist],
    ]);
});

test('boots out only the Haus Server label', () => {
    const commands: string[][] = [];

    stopProductionServer((args) => {
        commands.push(args);
        return { exitCode: 0, stderr: '', stdout: '' };
    });

    expect(commands).toEqual([['bootout', serverLabel]]);
});

test('kickstarts an already loaded Server and retains its previous pid', async () => {
    const commands: string[][] = [];
    const results = [
        { exitCode: 0, stderr: '', stdout: 'service = {\n\tpid = 481\n}\n' },
        { exitCode: 0, stderr: '', stdout: '' },
    ];

    const activation = await startProductionServer((args) => {
        commands.push(args);
        return results.shift() ?? { exitCode: 0, stderr: '', stdout: '' };
    });

    expect(activation).toEqual({ introducedLabel: false, previousPid: '481' });
    expect(commands).toEqual([
        ['print', serverLabel],
        ['kickstart', '-k', serverLabel],
    ]);
});

test('fails closed when bootstrap does not load the Server', async () => {
    const commands: string[][] = [];
    const results = [
        { exitCode: 113, stderr: 'Could not find service', stdout: '' },
        { exitCode: 5, stderr: 'Input/output error', stdout: '' },
    ];

    await expect(
        startProductionServer((args) => {
            commands.push(args);
            return results.shift() ?? { exitCode: 0, stderr: '', stdout: '' };
        }, secureProductionPath)
    ).rejects.toThrow('launchctl failed with exit code 5');
    expect(commands).toEqual([
        ['print', serverLabel],
        ['bootstrap', 'system', serverPlist],
    ]);
});

test('rejects an insecure Server plist before bootstrap', async () => {
    const commands: string[][] = [];

    await expect(
        startProductionServer(
            (args) => {
                commands.push(args);
                return { exitCode: 113, stderr: 'Could not find service', stdout: '' };
            },
            async (path) => ({
                mode: path === serverPlist ? 0o10_0664 : 0o04_0755,
                uid: 0,
            })
        )
    ).rejects.toThrow('root-owned and not writable');
    expect(commands).toEqual([['print', serverLabel]]);
});

test('does not treat an unexpected launchctl failure as an unloaded label', async () => {
    const commands: string[][] = [];

    await expect(
        startProductionServer((args) => {
            commands.push(args);
            return { exitCode: 1, stderr: 'Not authorized', stdout: '' };
        })
    ).rejects.toThrow('launchctl failed with exit code 1');
    expect(commands).toEqual([['print', serverLabel]]);
});

test('reports a bootout failure without exposing launchctl output', () => {
    expect(() =>
        stopProductionServer(() => ({
            exitCode: 5,
            stderr: 'credential=/private/secret',
            stdout: '',
        }))
    ).toThrow('launchctl failed with exit code 5');
});

function secureProductionPath(path: string) {
    return Promise.resolve({
        mode: path === serverPlist ? 0o10_0644 : 0o04_0755,
        uid: 0,
    });
}

import { expect, test } from 'bun:test';
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    computerAppExecutable,
    linkComputerCli,
    restorePreviousComputerApp,
    runningComputerApp,
    swapInComputerApp,
} from './computer-app.ts';

test('only an executable inside an app bundle names a running app', () => {
    expect(
        runningComputerApp(
            '/Users/me/.local/share/haus-computer/Haus Computer.app/Contents/MacOS/haus-computer'
        )
    ).toBe('/Users/me/.local/share/haus-computer/Haus Computer.app');
    expect(runningComputerApp('/Users/me/.local/bin/haus-computer')).toBeNull();
    expect(runningComputerApp('/opt/homebrew/bin/bun')).toBeNull();
});

test('an update and a rollback swap whole bundles and leave Computer data alone', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-app-swap-'));
    const destination = join(root, 'share', 'Haus Computer.app');
    const dataPath = join(root, '.haus', 'computer', 'servers', 'srv_test', 'attachment.json');
    try {
        await writeApp(destination, 'version one');
        await writeApp(`${destination}.next`, 'version two');
        await mkdir(join(root, '.haus', 'computer', 'servers', 'srv_test'), { recursive: true });
        await writeFile(dataPath, 'durable attachment');

        await swapInComputerApp(`${destination}.next`, destination);
        expect(await appVersion(destination)).toBe('version two');
        expect(await appVersion(`${destination}.prev`)).toBe('version one');
        expect(await lstat(`${destination}.next`).catch(() => null)).toBeNull();

        await restorePreviousComputerApp(destination);
        expect(await appVersion(destination)).toBe('version one');
        expect(await appVersion(`${destination}.prev`)).toBe('version two');
        expect(await readFile(dataPath, 'utf8')).toBe('durable attachment');
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});

test('a failed swap keeps the running bundle in place', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-app-swap-failure-'));
    const destination = join(root, 'Haus Computer.app');
    try {
        await writeApp(destination, 'trusted current');

        await expect(swapInComputerApp(join(root, 'missing.app'), destination)).rejects.toThrow(
            'could not be installed'
        );
        expect(await appVersion(destination)).toBe('trusted current');
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});

test('a rollback without a previous bundle refuses and changes nothing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-app-rollback-'));
    const destination = join(root, 'Haus Computer.app');
    try {
        await writeApp(destination, 'only version');

        await expect(restorePreviousComputerApp(destination)).rejects.toThrow(
            'No previous verified Haus Computer'
        );
        expect(await appVersion(destination)).toBe('only version');
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});

test('the CLI becomes a symlink into the bundle and drops the bare-executable leftovers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-app-link-'));
    const app = join(root, 'share', 'Haus Computer.app');
    const cli = join(root, 'bin', 'haus-computer');
    try {
        await writeApp(app, 'bundled');
        await mkdir(join(root, 'bin'), { recursive: true });
        await writeFile(cli, 'bare executable');
        await writeFile(`${cli}.prev`, 'previous bare executable');

        await linkComputerCli(app, cli);
        expect(await readlink(cli)).toBe(computerAppExecutable(app));
        expect(await readFile(cli, 'utf8')).toBe('bundled');
        expect(await lstat(`${cli}.prev`).catch(() => null)).toBeNull();

        await linkComputerCli(app, cli);
        expect(await readlink(cli)).toBe(computerAppExecutable(app));
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});

async function writeApp(appPath: string, version: string) {
    await mkdir(join(appPath, 'Contents', 'MacOS'), { recursive: true });
    await writeFile(computerAppExecutable(appPath), version);
}

async function appVersion(appPath: string) {
    return await readFile(computerAppExecutable(appPath), 'utf8');
}

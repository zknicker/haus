import { afterEach, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    CLAUDE_CODE_VERSION,
    type ClaudeInstallTarget,
    claudeInstallTarget,
    claudePlatformKey,
    ensureClaudeInstall,
} from './claude-install.ts';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

/** A registry-shaped tarball (`package/claude`) and the target that pins it. */
async function packagedTarget(): Promise<{ target: ClaudeInstallTarget; tarball: Uint8Array }> {
    const root = await mkdtemp(join(tmpdir(), 'haus-claude-install-'));
    roots.push(root);
    await mkdir(join(root, 'src', 'package'), { recursive: true });
    await writeFile(join(root, 'src', 'package', 'claude'), '#!/bin/sh\necho 2.1.284\n');
    execFileSync('tar', ['-czf', join(root, 'package.tgz'), '-C', join(root, 'src'), 'package']);
    const tarball = new Uint8Array(await readFile(join(root, 'package.tgz')));
    const installDir = join(root, 'install');
    return {
        tarball,
        target: {
            binaryPath: join(installDir, 'claude'),
            installDir,
            integrity: `sha512-${createHash('sha512').update(tarball).digest('base64')}`,
            platform: 'test',
            tarballUrl: 'https://registry.example/claude.tgz',
        },
    };
}

test('the pinned install matches the vendor pin the AI SDK bridge shipped', async () => {
    const bridge = JSON.parse(
        await readFile(
            join(import.meta.dir, '../../../assets/harness-bridges/claude-code/package.json'),
            'utf8'
        )
    );
    expect(bridge.dependencies['@anthropic-ai/claude-code']).toBe(CLAUDE_CODE_VERSION);
    const target = claudeInstallTarget('/home/op', 'linux-x64');
    expect(target.tarballUrl).toBe(
        `https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-${CLAUDE_CODE_VERSION}.tgz`
    );
    expect(() => claudeInstallTarget('/home/op', 'freebsd-x64')).toThrow('no pinned build');
});

test('platform keys follow Claude Code’s installer, musl included', () => {
    expect(claudePlatformKey('darwin', 'arm64')).toBe('darwin-arm64');
    expect(claudePlatformKey('linux', 'x64', () => true)).toBe('linux-x64-musl');
    expect(claudePlatformKey('linux', 'arm64', () => false)).toBe('linux-arm64');
});

test('install downloads once, verifies integrity, and installs an executable binary', async () => {
    const { target, tarball } = await packagedTarget();
    let downloads = 0;
    const fetchTarball = (async () => {
        downloads += 1;
        return new Response(tarball);
    }) as unknown as typeof fetch;
    expect(await ensureClaudeInstall(target, { fetch: fetchTarball })).toBe(target.binaryPath);
    expect((await stat(target.binaryPath)).mode & 0o111).not.toBe(0);
    // A completed install is an existence check; no turn downloads again.
    await ensureClaudeInstall(target, { fetch: fetchTarball });
    expect(downloads).toBe(1);
});

test('a download that fails its integrity check installs nothing', async () => {
    const { target } = await packagedTarget();
    const tampered = (async () => new Response('not the release')) as unknown as typeof fetch;
    await expect(ensureClaudeInstall(target, { fetch: tampered })).rejects.toThrow('integrity');
    await expect(stat(target.binaryPath)).rejects.toThrow();
});

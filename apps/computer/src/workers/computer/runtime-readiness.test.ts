import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectWorkerRuntimes } from './runtime-readiness.ts';

let home: string;
let bin: string;

beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), 'haus-worker-readiness-'));
    bin = join(home, 'bin');
    await mkdir(bin);
});
afterEach(async () => {
    await rm(home, { force: true, recursive: true });
});

async function install(command: string) {
    await writeFile(join(bin, command), '#!/bin/sh\nexit 1\n');
    await chmod(join(bin, command), 0o755);
}

const detect = (keychain = false) =>
    detectWorkerRuntimes({
        env: {},
        homeDir: home,
        keychainHasClaudeLogin: () => Promise.resolve(keychain),
        platform: 'darwin',
        searchPath: bin,
    });

test('a runtime with no binary or no login is not ready, and says which', async () => {
    await install('codex');
    expect(await detect()).toEqual([
        {
            detail: 'Claude Code is not installed on this Computer.',
            ready: false,
            runtime: 'claude-code',
        },
        {
            detail: 'Codex has no login on this Computer. Run codex login.',
            ready: false,
            runtime: 'codex',
        },
    ]);
});

test('the machine user’s own logins make both runtimes ready', async () => {
    await install('claude');
    await install('codex');
    await mkdir(join(home, '.codex'));
    await writeFile(join(home, '.codex', 'auth.json'), '{}');
    expect(await detect(true)).toEqual([
        { detail: null, ready: true, runtime: 'claude-code' },
        { detail: null, ready: true, runtime: 'codex' },
    ]);
});

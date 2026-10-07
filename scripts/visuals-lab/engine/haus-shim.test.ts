import { afterEach, expect, test } from 'bun:test';
import { existsSync, statSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { computerEntry, labPath } from './haus-shim.mjs';

const executable = { path: '/opt/runtime/bin/claude', searchPath: '/usr/bin:/bin' };
const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

const binDirIn = async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'visuals-lab-shim-'));
    roots.push(root);
    return path.join(root, 'bin');
};

test('without preview the PATH is the runtime alone and no shim is written', async () => {
    const binDir = await binDirIn();
    expect(await labPath({ binDir, executable, preview: false })).toBe(
        '/opt/runtime/bin:/usr/bin:/bin'
    );
    expect(existsSync(binDir)).toBe(false);
});

test('with preview an executable haus shim leads the PATH and execs the Agent CLI', async () => {
    const binDir = await binDirIn();
    expect(await labPath({ binDir, executable, preview: true })).toBe(
        `${binDir}:/opt/runtime/bin:/usr/bin:/bin`
    );
    const shim = path.join(binDir, 'haus');
    expect(statSync(shim).mode & 0o111).toBe(0o111);
    const script = await readFile(shim, 'utf8');
    expect(script.startsWith('#!/bin/sh\n')).toBe(true);
    expect(script).toContain(`exec '${process.execPath}' '${computerEntry}' '__agent' "$@"`);
});

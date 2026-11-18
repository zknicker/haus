import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    type InstallCommand,
    installSecretsRuntime,
    isSecretsRuntimeInstalled,
    secretsRuntimeVersions,
    secretsVarlockBin,
} from './runtime.ts';

const repoRoot = join(import.meta.dir, '../../../..');

let root: string;
let commands: string[];

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-secrets-runtime-'));
    commands = [];
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

/** Stands in for pnpm: records the command and lays down the varlock shim. */
const fakeInstall: InstallCommand = async ({ command, cwd }) => {
    commands.push(command);
    await mkdir(join(cwd, 'node_modules', '.bin'), { recursive: true });
    await writeFile(secretsVarlockBin(cwd), '#!/bin/sh\n');
    return { exitCode: 0, stderr: '' };
};

describe('secrets runtime pins', () => {
    test('match the repository pins the dev stack runs', async () => {
        const manifest = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
        expect(secretsRuntimeVersions).toEqual({
            plugin: manifest.devDependencies['@varlock/1password-plugin'],
            varlock: manifest.devDependencies.varlock,
        });
    });

    test('lock the same versions the manifest names', async () => {
        const lockfile = await readFile(
            join(import.meta.dir, '../../assets/secrets-runtime/pnpm-lock.yaml'),
            'utf8'
        );
        expect(lockfile).toContain(`  varlock@${secretsRuntimeVersions.varlock}:`);
        expect(lockfile).toContain(
            `  '@varlock/1password-plugin@${secretsRuntimeVersions.plugin}':`
        );
    });
});

describe('installSecretsRuntime', () => {
    test('installs with the pinned pnpm and frozen lockfile, then skips a matching install', async () => {
        await installSecretsRuntime(root, fakeInstall);
        await installSecretsRuntime(root, fakeInstall);

        expect(commands).toHaveLength(1);
        expect(commands[0]).toContain('corepack pnpm@');
        expect(commands[0]).toContain('--frozen-lockfile');
        expect(commands[0]).toContain('./node_modules/.bin/varlock --version');
        expect(JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))).toMatchObject({
            dependencies: { varlock: secretsRuntimeVersions.varlock },
        });
        expect(isSecretsRuntimeInstalled(root)).toBe(true);
    });

    test('a failed install names the Node requirement and leaves no marker', async () => {
        const failing: InstallCommand = async () => ({
            exitCode: 127,
            stderr: 'corepack: command not found\n',
        });
        await expect(installSecretsRuntime(root, failing)).rejects.toThrow(
            'needs Node.js 22 or newer with corepack. corepack: command not found'
        );
        await installSecretsRuntime(root, fakeInstall);
        expect(commands).toHaveLength(1);
    });
});

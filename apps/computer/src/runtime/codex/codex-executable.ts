import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import codexPackageJson from './pin/codex.package.json' with { type: 'text' };
import codexLockfile from './pin/codex.pnpm-lock.yaml' with { type: 'text' };

/**
 * The one Codex CLI every Haus Codex session runs: `@openai/codex` at the version codex-acp
 * pinned before (0.159.0), installed once per machine from a frozen lockfile and shared by
 * every Agent. Nothing installs per turn or per Agent.
 */
export const CODEX_CLI_VERSION = '0.159.0';

export interface CodexExecutable {
    /** Env the npm launcher would set, so Codex knows how it was installed. */
    readonly env: Record<string, string>;
    readonly path: string;
}

/** Content hash of the pin; a changed pin restarts parked sessions (`bootstrapFingerprint`). */
export const codexPinFingerprint = createHash('sha256')
    .update(codexPackageJson as unknown as string)
    .update('\0')
    .update(codexLockfile)
    .digest('hex');

const PNPM = ['corepack', 'pnpm@10.32.1'] as const;
const PLATFORM_TRIPLES: Readonly<Record<string, string>> = {
    'darwin-arm64': 'aarch64-apple-darwin',
    'darwin-x64': 'x86_64-apple-darwin',
    'linux-arm64': 'aarch64-unknown-linux-musl',
    'linux-x64': 'x86_64-unknown-linux-musl',
};

let installing: Promise<CodexExecutable> | null = null;

/** Machine software, not Server-scoped Agent state. */
export function codexInstallRoot(homeDirectory = homedir()): string {
    return join(homeDirectory, '.haus', 'cache', 'runtimes', 'codex');
}

/**
 * Resolves the pinned Codex binary, installing it on first use. Concurrent callers share one
 * install; a failed install is retried by the next call.
 */
export function resolvePinnedCodex(signal?: AbortSignal): Promise<CodexExecutable> {
    installing ??= installPinnedCodex(signal).catch((error: unknown) => {
        installing = null;
        throw error;
    });
    return installing;
}

async function installPinnedCodex(signal?: AbortSignal): Promise<CodexExecutable> {
    const dir = join(
        codexInstallRoot(),
        `${CODEX_CLI_VERSION}-${codexPinFingerprint.slice(0, 12)}`
    );
    const installed = locateBinary(dir);
    if (installed && (await versionOf(installed.path, signal)) === CODEX_CLI_VERSION) {
        return installed;
    }
    await mkdir(dir, { recursive: true });
    await writeAtomic(join(dir, 'package.json'), codexPackageJson as unknown as string);
    await writeAtomic(join(dir, 'pnpm-lock.yaml'), codexLockfile);
    await run(
        [
            ...PNPM,
            'install',
            '--frozen-lockfile',
            '--prod',
            '--ignore-workspace',
            '--store-dir',
            join(codexInstallRoot(), '.pnpm-store'),
        ],
        dir,
        signal
    );
    const binary = locateBinary(dir);
    if (!binary) {
        throw new Error(
            `The pinned Codex CLI ${CODEX_CLI_VERSION} installed without its ${platformKey()} binary.`
        );
    }
    const version = await versionOf(binary.path, signal);
    if (version !== CODEX_CLI_VERSION) {
        throw new Error(`The pinned Codex CLI reports ${version ?? 'no version'}.`);
    }
    return binary;
}

/** The native binary under the platform package, run directly rather than through Node. */
function locateBinary(dir: string): CodexExecutable | null {
    const triple = PLATFORM_TRIPLES[platformKey()];
    if (!triple) {
        throw new Error(`Codex has no binary for ${platformKey()}.`);
    }
    const link = join(dir, 'node_modules', '@openai', 'codex');
    if (!existsSync(link)) {
        return null;
    }
    // pnpm places the platform package beside the launcher package it is optional for.
    const packageRoot = realpathSync(link);
    const path = join(
        packageRoot,
        '..',
        `codex-${platformKey()}`,
        'vendor',
        triple,
        'bin',
        'codex'
    );
    if (!existsSync(path)) {
        return null;
    }
    return {
        env: { CODEX_MANAGED_BY_PNPM: '1', CODEX_MANAGED_PACKAGE_ROOT: packageRoot },
        path,
    };
}

async function versionOf(path: string, signal?: AbortSignal): Promise<string | null> {
    const output = await run([path, '--version'], undefined, signal);
    return /(\d+\.\d+\.\d+(?:-[\w.]+)?)/u.exec(output)?.[1] ?? null;
}

async function run(command: readonly string[], cwd: string | undefined, signal?: AbortSignal) {
    const proc = Bun.spawn([...command], {
        cwd,
        env: { ...process.env, CI: 'true', COREPACK_ENABLE_STRICT: '0' },
        signal,
        stderr: 'pipe',
        stdin: 'ignore',
        stdout: 'pipe',
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);
    if (exitCode !== 0) {
        throw new Error(`${command.slice(0, 3).join(' ')} failed (${exitCode}): ${stderr.trim()}`);
    }
    return stdout;
}

async function writeAtomic(path: string, content: string) {
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, content);
    await rename(temporary, path);
}

function platformKey(): string {
    return `${process.platform}-${process.arch}`;
}

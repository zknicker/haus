import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
// Bun's text loader embeds the pinned manifest and lockfile in the standalone
// executable, the same way harness bridges ship theirs.
import runtimeManifest from '../../assets/secrets-runtime/package.json' with { type: 'text' };
import runtimeLockfile from '../../assets/secrets-runtime/pnpm-lock.yaml' with { type: 'text' };
import { bridgeStoreDirForHost } from '../harness/bridge-bootstrap.ts';
import { bridgePnpm, retriedOnce } from '../harness/bridge-pnpm.ts';
import { runtimeSearchPath } from '../runtime-discovery.ts';

const manifestText = runtimeManifest as unknown as string;
const lockfileText = runtimeLockfile as unknown as string;
const pinned = parsePins(manifestText);

/** The plugin Varlock loads from `node_modules` beside the schema, pinned exactly. */
export const secretsRuntimePlugin = `@varlock/1password-plugin@${pinned.plugin}`;
export const secretsRuntimeVersions = pinned;

const fingerprint = createHash('sha256').update(manifestText).update(lockfileText).digest('hex');
const installTimeoutMs = 110_000;

export type InstallCommand = (input: { command: string; cwd: string }) => Promise<{
    exitCode: number;
    stderr: string;
}>;

/** The Varlock entry `haus-secrets` execs. Its pnpm shim runs `node` from PATH, as bridges do. */
export function secretsVarlockBin(root: string) {
    return join(root, 'node_modules', '.bin', 'varlock');
}

export function isSecretsRuntimeInstalled(root: string) {
    return existsSync(secretsVarlockBin(root));
}

/**
 * Installs pinned Varlock and its 1Password plugin into one attachment's
 * secrets directory with the same pinned pnpm and machine-wide store as the
 * harness bridges. The Computer needs Node.js (with corepack) on PATH, which
 * bridges already require; it never needs the `op` CLI. A matching marker
 * skips the install, so refresh stays cheap.
 */
export async function installSecretsRuntime(
    root: string,
    run: InstallCommand = runInstallCommand
): Promise<void> {
    const marker = join(root, 'node_modules', '.haus-secrets-runtime');
    if (isSecretsRuntimeInstalled(root) && (await readMarker(marker)) === fingerprint) {
        return;
    }
    await mkdir(root, { mode: 0o700, recursive: true });
    await writeFile(join(root, 'package.json'), manifestText);
    await writeFile(join(root, 'pnpm-lock.yaml'), lockfileText);
    const install = `${bridgePnpm} install --ignore-workspace --frozen-lockfile --prod --store-dir "${bridgeStoreDirForHost()}"`;
    const result = await run({
        command: `${install} && ${retriedOnce({ install, verify: './node_modules/.bin/varlock --version', wipe: 'node_modules' })}`,
        cwd: root,
    });
    if (result.exitCode !== 0) {
        const detail = result.stderr.trim().split('\n').slice(-3).join(' ').slice(0, 240);
        throw new Error(
            `Could not install Varlock on this Computer. It needs Node.js 22 or newer with corepack. ${detail}`.trim()
        );
    }
    await writeFile(marker, `${fingerprint}\n`);
}

async function readMarker(path: string) {
    try {
        return (await readFile(path, 'utf8')).trim();
    } catch {
        return null;
    }
}

async function runInstallCommand({ command, cwd }: { command: string; cwd: string }) {
    const child = Bun.spawn(['/bin/sh', '-c', command], {
        cwd,
        env: { CI: 'true', HOME: process.env.HOME ?? '', PATH: runtimeSearchPath() },
        stderr: 'pipe',
        stdin: 'ignore',
        stdout: 'ignore',
        timeout: installTimeoutMs,
    });
    const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    return { exitCode, stderr };
}

function parsePins(manifest: string) {
    const parsed: unknown = JSON.parse(manifest);
    const dependencies =
        typeof parsed === 'object' && parsed !== null && 'dependencies' in parsed
            ? parsed.dependencies
            : null;
    if (
        !(
            typeof dependencies === 'object' &&
            dependencies !== null &&
            'varlock' in dependencies &&
            typeof dependencies.varlock === 'string' &&
            '@varlock/1password-plugin' in dependencies &&
            typeof dependencies['@varlock/1password-plugin'] === 'string'
        )
    ) {
        throw new Error('The secrets runtime manifest must pin varlock and its 1Password plugin.');
    }
    return { plugin: dependencies['@varlock/1password-plugin'], varlock: dependencies.varlock };
}

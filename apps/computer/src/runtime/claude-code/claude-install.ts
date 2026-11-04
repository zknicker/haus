import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { access, chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * The Claude Code release every Agent runs; the integrities are the npm registry's for each
 * platform package of that release.
 */
export const CLAUDE_CODE_VERSION = '2.1.317';

const platformIntegrity: Readonly<Record<string, string>> = {
    'darwin-arm64':
        'sha512-Xnf9K4aGBuoYaODmEZ0o/lRvuYUCv2ZIDP+AXv15WVITryGgrsSA7CFL7KH+43kC6WhK8i6oysF6EbGdgBW4Aw==',
    'darwin-x64':
        'sha512-CyElNeIVipIXwn7oRY3a5PpeOm0RuwekKLNCZq/gFnrkmSMBnqSWlAKKc8Q1W2UBFlkejwbzI+uPfgD51aiJGw==',
    'linux-arm64':
        'sha512-awlwqIvbePCG9zVrlBm5L/3eELJmGJThom+1QgHeBK5N9F1dFpyBQP9M5A8s0PAaWBbLwDIm9SHVmZ6j/TftbA==',
    'linux-arm64-musl':
        'sha512-pLoJ/spITubBkyP30LzejrAKskx18by23l/aVoFuIjs7dMFiI7jLLs7dpwO+g2ZUbBpxxxexJuANKUYJiT8GbA==',
    'linux-x64':
        'sha512-u19fYJ4llqi+dAGAj6P1BNu/CRSe0rv4O8Mv/5SQPU5oXCYmUssbJgrBI6rWbIFRAE3YcLCzKlwdHbzlSXBlSA==',
    'linux-x64-musl':
        'sha512-Zwp/FvlSVo/Nqmw8uxKEzv4hZhdEIXOb9+bkkrf/QgH/yjXWTWIjFCxYt5Gay6jqeX9/5fLrXv//XSUatdXReA==',
};

export interface ClaudeInstallTarget {
    readonly binaryPath: string;
    readonly installDir: string;
    readonly integrity: string;
    readonly platform: string;
    readonly tarballUrl: string;
}

/** Where this machine's pinned binary lives: machine software, shared by every Agent. */
export function claudeInstallTarget(
    hostHomeDir: string = process.env.HAUS_COMPUTER_HOST_HOME ?? homedir(),
    platform: string = claudePlatformKey()
): ClaudeInstallTarget {
    const integrity = platformIntegrity[platform];
    if (!integrity) {
        throw new Error(`Claude Code ${CLAUDE_CODE_VERSION} has no pinned build for ${platform}.`);
    }
    const installDir = join(
        hostHomeDir,
        '.haus',
        'cache',
        'claude-code',
        `${CLAUDE_CODE_VERSION}-${platform}`
    );
    const name = `claude-code-${platform}`;
    return {
        binaryPath: join(installDir, 'claude'),
        installDir,
        integrity,
        platform,
        tarballUrl: `https://registry.npmjs.org/@anthropic-ai/${name}/-/${name}-${CLAUDE_CODE_VERSION}.tgz`,
    };
}

/** A changed pin restarts parked sessions through the executor's bootstrap drift check. */
export function claudeInstallFingerprint(target: ClaudeInstallTarget): string {
    return createHash('sha256')
        .update(JSON.stringify({ integrity: target.integrity, version: CLAUDE_CODE_VERSION }))
        .digest('hex');
}

const installs = new Map<string, Promise<string>>();

/**
 * Installs the pinned binary once per machine: download the platform tarball, verify its
 * registry integrity, unpack beside, and rename into place. A completed install is a single
 * existence check, so no turn pays for it twice.
 */
export function ensureClaudeInstall(
    target: ClaudeInstallTarget,
    options: { fetch?: typeof fetch; signal?: AbortSignal } = {}
): Promise<string> {
    const running = installs.get(target.installDir);
    if (running) {
        return running;
    }
    const install = installClaude(target, options).finally(() => {
        installs.delete(target.installDir);
    });
    installs.set(target.installDir, install);
    return install;
}

async function installClaude(
    target: ClaudeInstallTarget,
    options: { fetch?: typeof fetch; signal?: AbortSignal }
): Promise<string> {
    const marker = join(target.installDir, '.integrity');
    if (await isInstalled(target, marker)) {
        return target.binaryPath;
    }
    const staging = `${target.installDir}.staging-${randomUUID()}`;
    await mkdir(staging, { recursive: true });
    try {
        const response = await (options.fetch ?? fetch)(target.tarballUrl, {
            signal: options.signal,
        });
        if (!response.ok) {
            throw new Error(
                `Claude Code ${CLAUDE_CODE_VERSION} download failed with status ${response.status}.`
            );
        }
        const tarball = new Uint8Array(await response.arrayBuffer());
        const digest = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
        if (digest !== target.integrity) {
            throw new Error(
                `Claude Code ${CLAUDE_CODE_VERSION} download failed its integrity check.`
            );
        }
        const tarballPath = join(staging, 'package.tgz');
        await writeFile(tarballPath, tarball);
        await execFileAsync('tar', ['-xzf', tarballPath, '-C', staging], {
            signal: options.signal,
        });
        const unpacked = join(staging, 'package', 'claude');
        await chmod(unpacked, 0o755);
        await mkdir(target.installDir, { recursive: true });
        // Rename is atomic on one filesystem, so a concurrent Computer never sees half a binary.
        await rename(unpacked, target.binaryPath);
        await writeFile(marker, target.integrity);
        return target.binaryPath;
    } finally {
        await rm(staging, { force: true, recursive: true });
    }
}

async function isInstalled(target: ClaudeInstallTarget, marker: string): Promise<boolean> {
    if (!existsSync(marker)) {
        return false;
    }
    const recorded = await readFile(marker, 'utf8');
    if (recorded !== target.integrity) {
        return false;
    }
    try {
        await access(target.binaryPath);
        return true;
    } catch {
        return false;
    }
}

/** The npm platform suffix Claude Code's own installer picks (`install.cjs`). */
export function claudePlatformKey(
    platform: NodeJS.Platform = process.platform,
    arch: string = process.arch,
    isMusl: () => boolean = detectMusl
): string {
    if (platform === 'linux') {
        return `linux-${arch}${isMusl() ? '-musl' : ''}`;
    }
    return `${platform}-${arch}`;
}

function detectMusl(): boolean {
    return ['/lib/ld-musl-x86_64.so.1', '/lib/ld-musl-aarch64.so.1'].some((path) =>
        existsSync(path)
    );
}

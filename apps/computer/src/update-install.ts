import { createHash } from 'node:crypto';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
    computerAppleSigningIdentity,
    computerAppleTeamId,
    computerBundleId,
} from './build-identity.ts';
import {
    computerAppExecutable,
    computerAppName,
    installedComputerApp,
    linkComputerCli,
    restorePreviousComputerApp,
    swapInComputerApp,
} from './computer-app.ts';
import type { SignedComputerRelease } from './update-contract.ts';

export async function downloadAndVerifyArtifact(input: {
    onProgress(progress: { downloadedBytes: number; totalBytes: number | null }): Promise<void>;
    onVerify?: () => Promise<void>;
    release: SignedComputerRelease;
    verifyArtifact?: (path: string) => Promise<void>;
}) {
    const response = await fetch(input.release.release.artifactUrl);
    if (!(response.ok && response.body)) {
        throw new Error(`Computer release download failed (${response.status}).`);
    }
    const totalHeader = response.headers.get('content-length');
    const parsedTotalBytes = totalHeader ? Number(totalHeader) : null;
    const totalBytes =
        Number.isSafeInteger(parsedTotalBytes) && (parsedTotalBytes ?? 0) > 0
            ? parsedTotalBytes
            : null;
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'haus-computer-update-'));
    const archivePath = join(temporaryRoot, 'haus-computer.zip');
    const hash = createHash('sha256');
    let downloadedBytes = 0;
    try {
        const reader = response.body.getReader();
        const archive = await open(archivePath, 'wx', 0o600);
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                await archive.write(value);
                hash.update(value);
                downloadedBytes += value.byteLength;
                await input.onProgress({ downloadedBytes, totalBytes });
            }
        } finally {
            await archive.close();
        }
        await input.onVerify?.();
        if (hash.digest('hex') !== input.release.release.sha256) {
            throw new Error('Computer release checksum verification failed.');
        }
        if (input.verifyArtifact) {
            await input.verifyArtifact(archivePath);
            return archivePath;
        }
        return await unpackVerifiedApp(archivePath, input.release);
    } catch (cause) {
        await rm(temporaryRoot, { force: true, recursive: true });
        throw cause;
    }
}

export async function installComputerApp(appPath: string, destination = installedComputerApp()) {
    const staged = `${destination}.next`;
    await rm(staged, { force: true, recursive: true });
    await run(['/usr/bin/ditto', appPath, staged], 'The Haus Computer app could not be staged.');
    try {
        await verifyComputerApp(staged);
    } catch (cause) {
        await rm(staged, { force: true, recursive: true });
        throw cause;
    }
    await swapInComputerApp(staged, destination);
    await linkComputerCli(destination);
}

export async function rollbackComputerApp(destination = installedComputerApp()) {
    const previous = `${destination}.prev`;
    if (!(await stat(previous).catch(() => null))) {
        throw new Error('No previous verified Haus Computer is available.');
    }
    await verifyComputerApp(previous);
    await restorePreviousComputerApp(destination);
    await linkComputerCli(destination);
}

export async function verifyComputerApp(appPath: string) {
    if (process.platform !== 'darwin') {
        if (process.env.NODE_ENV === 'test') {
            return;
        }
        throw new Error('Haus Computer releases require Apple Silicon macOS.');
    }
    if (!(computerAppleTeamId && computerAppleSigningIdentity && computerBundleId)) {
        throw new Error('This Computer does not contain its Apple signing identity.');
    }
    const verified = Bun.spawnSync([
        '/usr/bin/codesign',
        '--verify',
        '--deep',
        '--strict',
        appPath,
    ]);
    if (verified.exitCode !== 0) {
        throw new Error('Computer Apple signature verification failed.');
    }
    const details = Bun.spawnSync(['/usr/bin/codesign', '-dv', '--verbose=4', appPath], {
        stderr: 'pipe',
        stdout: 'pipe',
    });
    const output = `${details.stdout.toString()}\n${details.stderr.toString()}`;
    if (
        details.exitCode !== 0 ||
        !hasExactLine(output, `Identifier=${computerBundleId}`) ||
        !hasExactLine(output, `TeamIdentifier=${computerAppleTeamId}`) ||
        !hasExactLine(output, `Authority=${computerAppleSigningIdentity}`)
    ) {
        throw new Error('Computer Apple signing identity was rejected.');
    }
}

async function unpackVerifiedApp(archivePath: string, release: SignedComputerRelease) {
    const root = dirname(archivePath);
    await run(
        ['/usr/bin/ditto', '-x', '-k', archivePath, root],
        'The Haus Computer release archive could not be unpacked.'
    );
    const appPath = join(root, computerAppName);
    await verifyComputerApp(appPath);
    verifyArtifactIdentity(computerAppExecutable(appPath), release);
    return appPath;
}

function verifyArtifactIdentity(path: string, descriptor: SignedComputerRelease) {
    const result = Bun.spawnSync([path, 'version'], { stderr: 'pipe', stdout: 'pipe' });
    if (result.exitCode !== 0) {
        throw new Error('Computer release executable identity could not be read.');
    }
    let identity: {
        protocolVersion?: unknown;
        sourceRevision?: unknown;
        version?: unknown;
    };
    try {
        identity = JSON.parse(result.stdout.toString());
    } catch {
        throw new Error('Computer release executable identity is invalid.');
    }
    if (
        identity.version !== descriptor.release.version ||
        identity.protocolVersion !== descriptor.release.protocolVersion ||
        identity.sourceRevision !== descriptor.release.sourceRevision
    ) {
        throw new Error('Computer release executable identity does not match its descriptor.');
    }
}

async function run(command: string[], failure: string) {
    const child = Bun.spawn(command, { stderr: 'pipe', stdout: 'ignore' });
    if ((await child.exited) !== 0) {
        throw new Error(failure);
    }
}

function hasExactLine(output: string, expected: string) {
    return output.split(/\r?\n/u).includes(expected);
}

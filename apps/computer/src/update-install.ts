import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, mkdtemp, open, rename, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
    computerAppleSigningIdentity,
    computerAppleTeamId,
    computerStandalone,
} from './build-identity.ts';
import type { SignedComputerRelease } from './update-contract.ts';

const installedPath =
    process.env.HAUS_COMPUTER_INSTALL_PATH ??
    (computerStandalone ? process.execPath : join(homedir(), '.local', 'bin', 'haus-computer'));

export async function downloadAndVerifyArtifact(input: {
    onProgress(progress: { downloadedBytes: number; totalBytes: number | null }): Promise<void>;
    onVerify?: () => Promise<void>;
    release: SignedComputerRelease;
    verifyArtifact?: (path: string) => Promise<void>;
}): Promise<string> {
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
    const artifactPath = join(temporaryRoot, 'haus-computer');
    const hash = createHash('sha256');
    let downloadedBytes = 0;
    try {
        const reader = response.body.getReader();
        const artifact = await open(artifactPath, 'wx', 0o700);
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                await artifact.write(value);
                hash.update(value);
                downloadedBytes += value.byteLength;
                await input.onProgress({ downloadedBytes, totalBytes });
            }
        } finally {
            await artifact.close();
        }
        await input.onVerify?.();
        if (hash.digest('hex') !== input.release.release.sha256) {
            throw new Error('Computer release checksum verification failed.');
        }
        if (input.verifyArtifact) {
            await input.verifyArtifact(artifactPath);
        } else {
            await verifyAppleExecutable(artifactPath);
            await verifyArtifactIdentity(artifactPath, input.release);
        }
        return artifactPath;
    } catch (cause) {
        await rm(temporaryRoot, { force: true, recursive: true });
        throw cause;
    }
}

export async function installStandaloneExecutable(
    artifactPath: string,
    options: {
        destination?: string;
        verify?: (path: string) => Promise<void>;
    } = {}
): Promise<void> {
    const destination = options.destination ?? installedPath;
    const previous = `${destination}.prev`;
    const previousNext = `${previous}.next`;
    const staged = `${destination}.next`;
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(artifactPath, staged);
    await chmod(staged, 0o755);
    await (options.verify ?? verifyAppleExecutable)(staged);
    await rm(previousNext, { force: true });
    try {
        if (await exists(destination)) {
            await copyFile(destination, previousNext);
            await chmod(previousNext, 0o755);
            await rename(previousNext, previous);
        }
        await rename(staged, destination);
    } catch (cause) {
        await rm(staged, { force: true });
        await rm(previousNext, { force: true });
        throw new Error('The verified Computer executable could not be installed.', {
            cause,
        });
    }
}

export async function rollbackStandaloneExecutable(
    options: { destination?: string; verify?: (path: string) => Promise<void> } = {}
): Promise<void> {
    const destination = options.destination ?? installedPath;
    const previous = `${destination}.prev`;
    const previousNext = `${previous}.next`;
    const staged = `${destination}.rollback`;
    if (!(await exists(previous))) {
        throw new Error('No previous verified Haus Computer executable is available.');
    }
    await (options.verify ?? verifyAppleExecutable)(previous);
    await rm(previousNext, { force: true });
    await rm(staged, { force: true });
    try {
        await copyFile(previous, staged);
        await chmod(staged, 0o755);
        await copyFile(destination, previousNext);
        await chmod(previousNext, 0o755);
        await rename(staged, destination);
        await rename(previousNext, previous);
    } catch (cause) {
        await rm(staged, { force: true });
        await rm(previousNext, { force: true });
        throw new Error('Haus Computer rollback failed.', { cause });
    }
}

export async function verifyAppleExecutable(path: string): Promise<void> {
    if (process.platform !== 'darwin') {
        if (process.env.NODE_ENV === 'test') {
            return;
        }
        throw new Error('Haus Computer releases require Apple Silicon macOS.');
    }
    if (!(computerAppleTeamId && computerAppleSigningIdentity)) {
        throw new Error('This Computer does not contain its Apple signing identity.');
    }
    const verified = Bun.spawnSync(['/usr/bin/codesign', '--verify', '--deep', '--strict', path]);
    if (verified.exitCode !== 0) {
        throw new Error('Computer Apple signature verification failed.');
    }
    const details = Bun.spawnSync(['/usr/bin/codesign', '-dv', '--verbose=4', path], {
        stderr: 'pipe',
        stdout: 'pipe',
    });
    const output = `${details.stdout.toString()}\n${details.stderr.toString()}`;
    if (
        details.exitCode !== 0 ||
        !hasExactLine(output, `TeamIdentifier=${computerAppleTeamId}`) ||
        !hasExactLine(output, `Authority=${computerAppleSigningIdentity}`)
    ) {
        throw new Error('Computer Apple signing identity was rejected.');
    }
}

function hasExactLine(output: string, expected: string) {
    return output.split(/\r?\n/u).includes(expected);
}

async function verifyArtifactIdentity(path: string, descriptor: SignedComputerRelease) {
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

async function exists(path: string) {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

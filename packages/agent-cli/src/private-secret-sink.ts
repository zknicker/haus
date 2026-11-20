import fs from 'node:fs';
import path from 'node:path';
import { AgentCliError } from './agent-error.ts';

// A newly created mode-0600 file that receives a secret the Server mints once,
// so the secret never reaches stdout, stderr, or a transcript. Adapted from Raft
// v1.21.23 packages/cli/src/commands/integration/privateSecretSink.ts: the file
// is created exclusively before the Server is contacted (an existing path, a
// symlink included, is refused, so a bad path costs nothing), and no failure
// ever unlinks by pathname, because the path may no longer name our file.

export interface PrivateSecretSink {
    dev: bigint;
    fd: number;
    filePath: string;
    ino: bigint;
}

export function preparePrivateSecretSink(
    output: string | undefined,
    platform: NodeJS.Platform = process.platform
): PrivateSecretSink {
    if (!output?.trim()) {
        throw new AgentCliError(
            'INVALID_ARG',
            '--output <new-private-path> is required; the secret is never printed.',
            {
                nextAction:
                    'Name a new file outside any shared or served folder, such as --output ./trigger-secret. Nothing was sent to the Server.',
            }
        );
    }
    if (platform === 'win32') {
        throw new AgentCliError(
            'LOCAL_WRITE_FAILED',
            'Private secret files are not supported on Windows. Nothing was sent to the Server.'
        );
    }
    const filePath = path.resolve(output);
    let fd: number | undefined;
    try {
        // `wx` is O_CREAT | O_EXCL: it refuses any existing path and never follows a symlink.
        fd = fs.openSync(filePath, 'wx', 0o600);
        const opened = fs.fstatSync(fd, { bigint: true });
        const sink = { dev: opened.dev, fd, filePath, ino: opened.ino };
        enforcePrivateMode(fd, filePath);
        assertSinkPathIdentity(sink);
        return sink;
    } catch (cause) {
        if (fd !== undefined) {
            closeIgnoringErrors(fd);
        }
        const retained =
            fd === undefined ? '' : ' An empty private file may remain; trash it before retrying.';
        throw new AgentCliError(
            'LOCAL_WRITE_FAILED',
            `Could not create a new private file at ${filePath}: ${errorMessage(cause)}.${retained}`,
            {
                nextAction:
                    'Choose a path that does not exist yet, in a folder that does. Nothing was sent to the Server.',
            }
        );
    }
}

/** Releases the descriptor after a failed request. Never unlinks: the path may name another file by now. */
export function closePrivateSecretSink(sink: PrivateSecretSink): void {
    closeIgnoringErrors(sink.fd);
}

/** Commits the secret. A failure never echoes the secret, only the path. */
export function writePrivateSecretSink(sink: PrivateSecretSink, secret: string): void {
    try {
        fs.writeFileSync(sink.fd, secret, { encoding: 'utf8' });
        fs.fsyncSync(sink.fd);
        enforcePrivateMode(sink.fd, sink.filePath);
        assertSinkPathIdentity(sink);
        fs.closeSync(sink.fd);
        assertSinkPathIdentity(sink);
    } catch (cause) {
        closeIgnoringErrors(sink.fd);
        const message =
            cause instanceof SinkPathChangedError
                ? `The Server minted a new secret, but ${sink.filePath} was replaced before the write finished; a private file holding it may remain elsewhere.`
                : `The Server minted a new secret, but writing it to ${sink.filePath} failed; that file may hold part of it.`;
        throw new AgentCliError('LOCAL_WRITE_FAILED', message, {
            nextAction:
                'Trash any file left at that path, then rotate the secret again into a new path.',
        });
    }
}

class SinkPathChangedError extends Error {}

function enforcePrivateMode(fd: number, filePath: string): void {
    fs.fchmodSync(fd, 0o600);
    const mode = fs.fstatSync(fd).mode & 0o777;
    if (mode !== 0o600) {
        throw new Error(`could not set mode 0600 on ${filePath}: got 0${mode.toString(8)}`);
    }
}

function assertSinkPathIdentity(sink: PrivateSecretSink): void {
    let current: fs.BigIntStats;
    try {
        current = fs.lstatSync(sink.filePath, { bigint: true });
    } catch {
        throw new SinkPathChangedError(`${sink.filePath} changed after it was created`);
    }
    if (current.dev !== sink.dev || current.ino !== sink.ino) {
        throw new SinkPathChangedError(`${sink.filePath} changed after it was created`);
    }
}

function closeIgnoringErrors(fd: number): void {
    try {
        fs.closeSync(fd);
    } catch {
        // Already closed, or the descriptor is gone; the caller reports what remains.
    }
}

function errorMessage(cause: unknown): string {
    if (cause instanceof Error && 'code' in cause && typeof cause.code === 'string') {
        if (cause.code === 'EEXIST') {
            return 'the path already exists';
        }
        return cause.code === 'ENOENT' ? 'its folder does not exist' : cause.code;
    }
    return cause instanceof Error ? cause.message : String(cause);
}

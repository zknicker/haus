import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
    chmodSync,
    closeSync,
    existsSync,
    mkdtempSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentCliError, renderAgentCliError } from './agent-error.ts';
import {
    closePrivateSecretSink,
    preparePrivateSecretSink,
    writePrivateSecretSink,
} from './private-secret-sink.ts';

// Adapted from Raft v1.21.23 packages/cli/src/commands/integration/app.test.ts
// (the private secret sink cases).

let work: string;

beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'haus-secret-sink-'));
});

afterEach(() => {
    rmSync(work, { force: true, recursive: true });
});

describe('private secret sink', () => {
    test('creates the file mode 0600 even under a permissive umask', () => {
        const output = join(work, 'secret');
        const previous = process.umask(0o000);
        try {
            const sink = preparePrivateSecretSink(output);
            expect(statSync(output).mode & 0o777).toBe(0o600);
            writePrivateSecretSink(sink, 'grtt_value');
        } finally {
            process.umask(previous);
        }
        expect(readFileSync(output, 'utf8')).toBe('grtt_value');
        expect(statSync(output).mode & 0o777).toBe(0o600);
    });

    test('names a missing folder without creating anything', () => {
        const output = join(work, 'missing', 'secret');

        expect(() => preparePrivateSecretSink(output)).toThrow('its folder does not exist');
        expect(existsSync(join(work, 'missing'))).toBe(false);
    });

    test('fails closed on Windows before creating a file', () => {
        const output = join(work, 'secret');

        expect(() => preparePrivateSecretSink(output, 'win32')).toThrow(AgentCliError);
        expect(existsSync(output)).toBe(false);
    });

    test('close never unlinks its path or a replacement', () => {
        const output = join(work, 'secret');
        const moved = join(work, 'moved');
        const sink = preparePrivateSecretSink(output);
        renameSync(output, moved);
        writeFileSync(output, 'replacement-bytes', { mode: 0o640 });
        chmodSync(output, 0o640);

        closePrivateSecretSink(sink);

        expect(readFileSync(output, 'utf8')).toBe('replacement-bytes');
        expect(statSync(output).mode & 0o777).toBe(0o640);
        expect(readFileSync(moved, 'utf8')).toBe('');
    });

    test('a write failure reports the path but never the secret', () => {
        const output = join(work, 'secret');
        const secret = 'grtt_must_not_reach_error_output';
        const sink = preparePrivateSecretSink(output);
        closeSync(sink.fd);

        let error: unknown;
        try {
            writePrivateSecretSink(sink, secret);
        } catch (cause) {
            error = cause;
        }

        expect(error).toBeInstanceOf(AgentCliError);
        const rendered = renderAgentCliError(error as AgentCliError);
        expect(rendered).toContain(output);
        expect(rendered).not.toContain(secret);
        expect(readFileSync(output, 'utf8')).toBe('');
        expect(statSync(output).mode & 0o777).toBe(0o600);
    });
});

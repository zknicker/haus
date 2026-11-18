import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
    chmodSync,
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as z from 'zod';
import {
    type AgentApiRequest,
    type AgentApiRequester,
    AgentApiTransportError,
} from '../agent-api-client.ts';
import { AgentCliError, renderAgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { runTriggerCreate, runTriggerRotate } from './agent-trigger.ts';

// Raft's rotate-secret contract (v1.21.23 app.test.ts, adapted): --output is
// required, the file is created before the Server is contacted, and the secret
// reaches only that file.

const secret = 'grtt_must_never_reach_output';
const trigger = {
    anchorChatId: 'cht_test',
    anchorMessageId: 'msg_test',
    anchorTarget: '#general',
    createdAt: '2026-09-01T10:00:00.000Z',
    createdByHandle: null,
    createdByUserId: null,
    disabledAt: null,
    fireCount: 0,
    id: 'trg_test',
    instruction: null,
    kind: 'webhook',
    lastFiredAt: null,
    ownerAgentId: 'agt_test',
    ownerHandle: 'blippy',
    status: 'armed',
    title: 'sentry alert',
    updatedAt: '2026-09-01T10:00:00.000Z',
    url: 'https://haus.example/api/triggers/trg_test',
    version: 1,
};
const secretResult = {
    curl: `curl -X POST ${trigger.url} -H "Authorization: Bearer ${secret}"`,
    secret,
    trigger,
    url: trigger.url,
};
const createArgs = { '--message-id': 'deadbeef', '--title': 'sentry alert' };

let work: string;

beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'haus-trigger-secret-'));
});

afterEach(() => {
    rmSync(work, { force: true, recursive: true });
});

describe('webhook trigger secrets', () => {
    test('create sends the webhook body and writes the secret only to the --output file', async () => {
        const calls: { input: AgentApiRequest; route: string }[] = [];
        const written: string[] = [];
        const output = join(work, 'secret');
        const client = requester((route, input) => {
            calls.push({ input, route });
            return secretResult;
        });

        await runTriggerCreate(args({ ...createArgs, '--output': output }), {
            client,
            write: (text) => written.push(text),
        });

        expect(calls).toEqual([
            {
                input: {
                    body: { kind: 'webhook', messageId: 'deadbeef', title: 'sentry alert' },
                    method: 'POST',
                },
                route: '/api/agent/triggers',
            },
        ]);
        const receipt = written.join('');
        expect(receipt).not.toContain(secret);
        expect(readFileSync(output, 'utf8')).toBe(secret);
        expect(statSync(output).mode & 0o777).toBe(0o600);
        expect(receipt).toStartWith('Created. trg_test [webhook · armed] "sentry alert"');
        expect(receipt).toContain(trigger.url);
        expect(receipt).toContain(`Secret: written to ${output} (new file, mode 0600)`);
        expect(receipt).toContain(
            'haus trigger rotate --id trg_test --output <new-path> replaces it'
        );
        expect(receipt).toContain('haus trigger log --id trg_test');
    });

    test('rotate writes the secret only to a new 0600 file and prints a test command that reads it', async () => {
        const written: string[] = [];
        const output = join(work, 'secret');

        await runTriggerRotate(args({ '--id': 'trg_test', '--output': output }), {
            client: requester(() => secretResult),
            write: (text) => written.push(text),
        });

        const receipt = written.join('');
        expect(receipt).not.toContain(secret);
        expect(readFileSync(output, 'utf8')).toBe(secret);
        expect(statSync(output).mode & 0o777).toBe(0o600);
        expect(receipt).toStartWith('Rotated. The previous secret no longer works.');
        expect(receipt).toContain(`written to ${output}`);
        expect(receipt).toContain('then trash the file');
        expect(receipt).toContain('Never post the secret in any chat');
        expect(receipt).toContain(
            `curl -sS -o /dev/null -w '%{http_code}\\n' -X POST '${trigger.url}' -H "Authorization: Bearer $(cat '${output}')"`
        );
    });

    test('rotate and webhook create refuse a missing --output before contacting the Server', async () => {
        const deps = { client: unreachable(), write: () => undefined };

        for (const run of [
            () => runTriggerRotate(args({ '--id': 'trg_test' }), deps),
            () => runTriggerRotate(args({ '--id': 'trg_test', '--output': ' ' }), deps),
            () => runTriggerCreate(args(createArgs), deps),
        ]) {
            const error = await run().catch((cause: unknown) => cause);
            expect(error).toBeInstanceOf(AgentCliError);
            expect((error as AgentCliError).code).toBe('INVALID_ARG');
            expect((error as AgentCliError).message).toContain(
                '--output <new-private-path> is required'
            );
        }
    });

    test('a github create refuses --output, since it has no secret', async () => {
        const deps = { client: unreachable(), write: () => undefined };
        const output = join(work, 'secret');

        await expect(
            runTriggerCreate(
                args({
                    ...createArgs,
                    '--event': 'push',
                    '--kind': 'github',
                    '--org': 'acme',
                    '--output': output,
                }),
                deps
            )
        ).rejects.toThrow('--output is for webhook triggers; a github trigger has no secret.');
        expect(existsSync(output)).toBe(false);
    });

    test('refuses an existing path or a symlink before POST, leaving its bytes and mode alone', async () => {
        const existing = join(work, 'existing');
        writeFileSync(existing, 'sentinel-bytes', { mode: 0o640 });
        chmodSync(existing, 0o640);
        const link = join(work, 'link');
        symlinkSync(join(work, 'target-of-link'), link);
        const deps = { client: unreachable(), write: () => undefined };

        for (const output of [existing, link]) {
            const error = await runTriggerRotate(
                args({ '--id': 'trg_test', '--output': output }),
                deps
            ).catch((cause: unknown) => cause);
            expect((error as AgentCliError).code).toBe('LOCAL_WRITE_FAILED');
            expect((error as AgentCliError).message).toContain('the path already exists');
        }
        expect(readFileSync(existing, 'utf8')).toBe('sentinel-bytes');
        expect(statSync(existing).mode & 0o777).toBe(0o640);
        expect(existsSync(join(work, 'target-of-link'))).toBe(false);
    });

    test('a Server refusal keeps the empty private file and says nothing was rotated', async () => {
        const output = join(work, 'secret');
        const client = requester(() => {
            expect(statSync(output).mode & 0o777).toBe(0o600);
            throw new AgentCliError('INVALID_ARG', 'trigger_has_no_secret: github triggers…');
        });

        const error = (await runTriggerRotate(args({ '--id': 'trg_gh', '--output': output }), {
            client,
            write: () => undefined,
        }).catch((cause: unknown) => cause)) as AgentCliError;

        expect(error.code).toBe('INVALID_ARG');
        expect(error.message).toBe('trigger_has_no_secret: github triggers…');
        expect(error.options.nextAction).toBe(
            `Nothing was rotated. The empty file at ${output} remains; trash it before retrying.`
        );
        expect(readFileSync(output, 'utf8')).toBe('');
        expect(statSync(output).mode & 0o777).toBe(0o600);
    });

    test('an unanswered request warns that the Server may have acted', async () => {
        const output = join(work, 'secret');
        const client = requester(() => {
            throw new AgentApiTransportError('SERVER_5XX', 'The Haus server is unavailable.', {
                nextAction: 'Retry after the Haus Server is reachable.',
            });
        });

        const error = (await runTriggerCreate(args({ ...createArgs, '--output': output }), {
            client,
            write: () => undefined,
        }).catch((cause: unknown) => cause)) as AgentCliError;

        expect(error.options.nextAction).toBe(
            `The Server may have created the trigger anyway; check haus trigger list before retrying. The empty file at ${output} remains; trash it before retrying. Retry after the Haus Server is reachable.`
        );
    });

    test('a failed local write after minting never discloses the secret', async () => {
        const output = join(work, 'secret');
        const client = requester(() => {
            rmSync(output);
            writeFileSync(output, 'replacement', { mode: 0o640 });
            return secretResult;
        });
        const written: string[] = [];

        const error = (await runTriggerRotate(args({ '--id': 'trg_test', '--output': output }), {
            client,
            write: (text) => written.push(text),
        }).catch((cause: unknown) => cause)) as AgentCliError;

        expect(error.code).toBe('LOCAL_WRITE_FAILED');
        expect(renderAgentCliError(error)).not.toContain(secret);
        expect(written).toEqual([]);
        expect(readFileSync(output, 'utf8')).toBe('replacement');
    });

    test('quotes a path with a single quote so the test command stays one argument', async () => {
        const output = join(work, "it's-secret");
        const written: string[] = [];

        await runTriggerRotate(args({ '--id': 'trg_test', '--output': output }), {
            client: requester(() => secretResult),
            write: (text) => written.push(text),
        });

        expect(written.join('')).toContain(`$(cat '${work}/it'\\''s-secret')`);
    });
});

function args(values: Record<string, string>): ParsedArgs {
    return { flags: {}, help: false, positionals: [], values };
}

function unreachable(): AgentApiRequester {
    return requester(() => {
        throw new Error('the CLI must not contact the Server');
    });
}

function requester(respond: (route: string, input: AgentApiRequest) => unknown): AgentApiRequester {
    return {
        async request<T>(
            route: string,
            schema: z.ZodType<T>,
            input: AgentApiRequest = {}
        ): Promise<T> {
            return schema.parse(respond(route, input));
        },
    };
}

import { expect, test } from 'bun:test';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError, renderAgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { runClaim } from './agent-claim-actions.ts';
import { runSend } from './agent-message-send.ts';

// ADR 0052: there are no Threads. A `<target>:<shortId>` target is refused before any request,
// with a receipt naming what replaces it: an inline reply, or a Task for work.

const neverAsked = (calls: string[]): AgentApiRequester => ({
    request: async (route: string) => {
        calls.push(route);
        throw new Error('the Server must not be asked');
    },
});

test('a send to a thread-shaped target is refused with the inline-reply and Task steps', async () => {
    for (const [target, parent] of [
        ['#general:1a2b3c4d', '#general'],
        ['dm:@zach:1a2b3c4d', 'dm:@zach'],
    ] as const) {
        const calls: string[] = [];
        const failure = await runSend(args({ '--target': target }), {
            client: neverAsked(calls),
            mintNonce: () => 'nonce',
            readStdin: async () => 'Here is the result.',
            stdinIsTty: false,
            write: () => undefined,
        }).then(
            () => null,
            (error: unknown) => error
        );
        expect(calls).toEqual([]);
        expect(failure).toBeInstanceOf(AgentCliError);
        const error = failure as AgentCliError;
        expect(error.code).toBe('THREAD_TARGET_REMOVED');
        expect(error.message).toStartWith('Threads are gone:');
        expect(error.options.nextAction).toStartWith(
            `Reply inline instead: haus message send --target "${parent}" --reply-to 1a2b3c4d.`
        );
        expect(error.options.nextAction).toContain('start a Task');
    }
});

test('a claim on a thread-shaped target is refused the same way', async () => {
    const calls: string[] = [];
    const failure = await runClaim(
        { ...args({ '--target': '#general:1a2b3c4d' }), valueLists: { '--number': ['7'] } },
        {
            client: neverAsked(calls),
            mintNonce: () => 'nonce',
            readStdin: async () => '',
            stdinIsTty: () => false,
            write: () => undefined,
        }
    ).then(
        () => null,
        (error: unknown) => error
    );

    expect(calls).toEqual([]);
    expect(failure).toBeInstanceOf(AgentCliError);
    expect((failure as AgentCliError).code).toBe('THREAD_TARGET_REMOVED');
    expect(renderAgentCliError(failure as AgentCliError)).toContain(
        'Reply inline instead: haus message send --target "#general" --reply-to 1a2b3c4d.'
    );
});

function args(values: Record<string, string>): ParsedArgs {
    return { flags: {}, help: false, positionals: [], valueLists: {}, values };
}

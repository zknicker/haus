import { expect, test } from 'bun:test';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import { readProfileUpdate, runProfileShow, runProfileUpdate } from './agent-profile.ts';

function args(values: Record<string, string>, flags: Record<string, boolean> = {}): ParsedArgs {
    return { flags, help: false, positionals: [], valueLists: {}, values };
}

const noStdin = { readStdin: () => Promise.reject(new Error('stdin was not requested')) };

function requester(seen: AgentApiRequest[], response: unknown): AgentApiRequester {
    return {
        request(_path, schema, input) {
            seen.push(input ?? {});
            return Promise.resolve(schema.parse(response));
        },
    };
}

test('profile update sends a conversation style and a normalized emoji', async () => {
    expect(
        await readProfileUpdate(
            args({ '--conversation-style': '  Dry wit.  ', '--emoji': '❤' }),
            noStdin
        )
    ).toEqual({ conversationStyle: 'Dry wit.', signatureEmoji: '❤️' });
});

test('profile update reads a conversation style from stdin with -', async () => {
    expect(
        await readProfileUpdate(args({ '--conversation-style': '-' }), {
            readStdin: () => Promise.resolve('Sea-shanty asides, sparingly.\n'),
        })
    ).toEqual({ conversationStyle: 'Sea-shanty asides, sparingly.' });
});

test('clear flags send null and refuse a contradicting value', async () => {
    expect(
        await readProfileUpdate(
            args({}, { '--clear-conversation-style': true, '--clear-emoji': true }),
            noStdin
        )
    ).toEqual({ conversationStyle: null, signatureEmoji: null });
    await expect(
        readProfileUpdate(args({ '--emoji': '🦊' }, { '--clear-emoji': true }), noStdin)
    ).rejects.toThrow(/not both/u);
});

test('profile update refuses no change, text emoji, and an oversized style', async () => {
    await expect(readProfileUpdate(args({}), noStdin)).rejects.toThrow(/Provide --description/u);
    await expect(readProfileUpdate(args({ '--emoji': 'ok' }), noStdin)).rejects.toThrow(
        /exactly one emoji/u
    );
    await expect(
        readProfileUpdate(args({ '--conversation-style': 'x'.repeat(2001) }), noStdin)
    ).rejects.toThrow(/2000 characters/u);
});

test('profile show renders the caller own style and default emoji', async () => {
    const output: string[] = [];
    await runProfileShow(args({}), {
        client: requester([], {
            profile: {
                conversationStyle: null,
                description: 'Release notes.',
                handle: 'orbit',
                isSelf: true,
                signatureEmoji: null,
            },
        }),
        ...noStdin,
        write: (text) => output.push(text),
    });
    expect(output.join('')).toContain('Signature emoji: 👀 (default)\n');
    expect(output.join('')).toContain('Conversation style: (none; the house personality alone)\n');
});

test('profile update posts only the changed fields', async () => {
    const seen: AgentApiRequest[] = [];
    const output: string[] = [];
    await runProfileUpdate(args({ '--emoji': '🦊' }), {
        client: requester(seen, {
            profile: {
                conversationStyle: 'Dry wit.',
                description: null,
                handle: 'orbit',
                isSelf: true,
                signatureEmoji: '🦊',
            },
        }),
        ...noStdin,
        write: (text) => output.push(text),
    });
    expect(seen[0]).toMatchObject({ body: { signatureEmoji: '🦊' }, method: 'POST' });
    expect(output.join('')).toContain('Signature emoji: 🦊\nConversation style: Dry wit.\n');
    expect(output.join('')).not.toContain('rides every message');
});

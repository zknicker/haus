import { expect, test } from 'bun:test';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import { runMessageAttention } from './agent-message-attention.ts';

test('follow and unfollow address a message without creating a thread', async () => {
    const requests: { path: string; input: AgentApiRequest | undefined }[] = [];
    const client: AgentApiRequester = {
        request(path, schema, input) {
            requests.push({ path, input });
            return Promise.resolve(
                schema.parse({
                    target: '#general',
                    followed: path.endsWith('/follow'),
                })
            );
        },
    };
    const args = {
        flags: {},
        help: false,
        positionals: [],
        valueLists: {},
        values: { '--target': '#general', '--message-id': '1a2b3c4d' },
    };
    const output: string[] = [];
    for (const follow of [true, false]) {
        await runMessageAttention(follow, args, { client, write: (text) => output.push(text) });
    }
    expect(requests.map(({ path }) => path)).toEqual([
        '/api/agent/messages/follow',
        '/api/agent/messages/unfollow',
    ]);
    for (const { input } of requests) {
        expect(input).toEqual({
            body: { target: '#general', messageId: '1a2b3c4d' },
            method: 'POST',
        });
    }
    expect(output[1]).toContain('Direct mentions still reach you');
});

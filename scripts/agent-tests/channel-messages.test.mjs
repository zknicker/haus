import assert from 'node:assert/strict';
import test from 'node:test';
import { authoredInChannel, readChannelMessages } from './channel-messages.mjs';

test('reads only the requested channel, inline replies included', async () => {
    const read = [];
    const messages = {
        channel: [
            { content: 'human request', author: 'human' },
            { content: 'inline answer', author: 'agent' },
        ],
        unrelated: [{ content: 'wrong channel', author: 'agent' }],
    };
    const kit = {
        serverId: 'server',
        async readMessages(chatId) {
            read.push(chatId);
            return [...messages[chatId]];
        },
    };
    const result = await readChannelMessages(kit, 'channel');
    assert.deepEqual(
        result.map((message) => message.content),
        ['human request', 'inline answer']
    );
    assert.deepEqual(read, ['channel']);
});

test('counts an Agent message only after the head', async () => {
    const agent = (agentId, sequence, content) => ({
        author: { agentId, kind: 'agent' },
        content,
        sequence,
    });
    const messages = {
        channel: [
            agent('agt_worker', 1, 'before head'),
            agent('agt_worker', 3, 'top level'),
            agent('agt_other', 4, 'someone else'),
        ],
    };
    const kit = {
        authoredBy: (rows, agentId, after) =>
            rows
                .filter((row) => row.sequence > after && row.author.agentId === agentId)
                .map((row) => row.content),
        async readMessages(chatId) {
            return messages[chatId];
        },
        serverId: 'server',
    };
    assert.deepEqual(await authoredInChannel(kit, 'channel', 'agt_worker', 2), ['top level']);
    assert.deepEqual(await authoredInChannel(kit, 'channel', 'agt_other', 2), ['someone else']);
});

import { expect, test } from 'bun:test';
import type { TaskReplay } from '@haus/api';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('a fresh Task session rereads its newest 50 messages before the ones that woke it, and its brief', async () => {
    const captain = await fixture.mintRunner('run_task_replay_captain');
    const started = await fixture.post('/api/agent/tasks/start', captain, {
        brief: 'Rotate the signing key.',
        machine: fixture.computerId,
    });
    const { shortId } = (started.body as { task?: { shortId: string } }).task ?? { shortId: '' };
    const task = await fixture.owner.trpc.task.get.query({ serverId: fixture.serverId, shortId });
    const chatId = task.chatId ?? '';
    const sent: number[] = [];
    for (let index = 1; index <= 52; index += 1) {
        const { message } = await fixture.owner.trpc.chat.send.mutate({
            chatId,
            content: `Note ${index}.`,
            nonce: `task_replay_${index}`,
            serverId: fixture.serverId,
        });
        sent.push(message.sequence);
    }
    const asTask = await fixture.mintRunner('run_task_replay', task.agentId ?? '', chatId, false);

    const replay = await read(asTask, `?before=${sent.at(-1)}`);
    expect(replay.status).toBe(200);
    const body = replay.body as TaskReplay;
    expect(body.brief).toMatchObject({ author: 'orbit', body: 'Rotate the signing key.' });
    expect(body.messages.map((message) => message.body)).toEqual(
        Array.from({ length: 50 }, (_, index) => `Note ${index + 1 + 1}.`)
    );
    expect(body.messages[0]?.author).toBe('ada');

    expect(await read(asTask, `?before=${sent[2]}`)).toMatchObject({
        body: {
            brief: { body: 'Rotate the signing key.' },
            messages: [{ body: 'Note 1.' }, { body: 'Note 2.' }],
        },
        status: 200,
    });
    expect(await read(asTask, `?before=${sent[0]}`)).toMatchObject({
        body: { brief: { body: 'Rotate the signing key.' }, messages: [] },
        status: 200,
    });
    expect(await read(asTask, '?before=1')).toMatchObject({
        body: { brief: null, messages: [] },
        status: 200,
    });
    expect(await read(captain, '')).toMatchObject({ body: { code: 'INVALID_ARG' }, status: 400 });
});

async function read(runner: { token: string }, query: string) {
    const response = await fetch(new URL(`/api/agent/tasks/replay${query}`, fixture.harness.url), {
        headers: { authorization: `Bearer ${runner.token}` },
    });
    return { body: (await response.json()) as unknown, status: response.status };
}

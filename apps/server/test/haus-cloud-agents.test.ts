import { expect, test } from 'bun:test';
import type { CloudAgentWork } from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

test('one Cloud Agent work writes its Message, record, first Run, Thread, and events', async () => {
    const runner = await fixture.mintRunner('run_cloud_create');
    const head = await fixture.owner.trpc.chat.eventHead.query({ serverId: fixture.serverId });

    const created = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-create', content: 'Handing @ada the work in #product.' })
    );
    expect(created.status).toBe(200);
    const work = created.body.work as CloudAgentWork;
    expect(created.body).toMatchObject({
        chatId: fixture.channelId,
        idempotent: false,
        target: '#product',
        work: {
            agentId: fixture.orbitAgentId,
            cancelRequestedAt: null,
            chatId: fixture.channelId,
            computerId: fixture.computerId,
            provider: 'cursor',
            providerAgentId: null,
            repository: 'haus/haus',
            startingRef: 'main',
            status: 'queued',
            terminalAt: null,
            title: 'Fix the flaky delivery test',
        },
    });
    expect(work.runs).toHaveLength(1);
    expect(work.runs[0]).toMatchObject({ runId: created.body.runId, status: 'queued' });

    const threadChatId = `cht_thr_${(created.body.messageId as string).slice('msg_'.length)}`;
    const [thread] = (await fixture.harness.sql`
        select anchor_message_id, parent_chat_id from chats where id = ${threadChatId}
    `) as { anchor_message_id: string; parent_chat_id: string }[];
    expect(thread).toMatchObject({
        anchor_message_id: created.body.messageId,
        parent_chat_id: fixture.channelId,
    });

    const events = await fixture.owner.trpc.chat.events.query({
        afterCursor: head.cursor,
        serverId: fixture.serverId,
    });
    expect(events.map((event) => event.type)).toEqual([
        'message.created',
        'cloud-agent-work.updated',
    ]);
    expect(events[1]).toMatchObject({
        chatId: fixture.channelId,
        cloudAgentWorkId: work.id,
        messageId: created.body.messageId,
        type: 'cloud-agent-work.updated',
    });

    const replay = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-create', content: 'Handing @ada the work in #product.' })
    );
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ idempotent: true, work: { id: work.id } });
    expect(await fixture.countWork()).toBe(1);

    // The Message reads back to humans and Agents with its typed body.
    const history = await fixture.owner.trpc.chat.messages.query({
        chatId: fixture.channelId,
        serverId: fixture.serverId,
    });
    expect(history.messages.find((message) => message.id === created.body.messageId)).toMatchObject(
        {
            body: { kind: 'cloud-agent-work', work: { id: work.id } },
            content: `Handing [@ada](user://${fixture.ownerUserId}) the work in [#product](chat://${fixture.channelId}).`,
        }
    );
});

test('a launch that fails validation creates nothing', async () => {
    const runner = await fixture.mintRunner('run_cloud_invalid');
    const before = await fixture.countWork();

    expect(
        (
            await fixture.postStart(
                runner,
                fixture.startBody({ nonce: 'bad-repo', repository: 'haus' })
            )
        ).status
    ).toBe(400);
    expect(
        (
            await fixture.postStart(
                runner,
                fixture.startBody({ nonce: 'bad-title', title: 'a'.repeat(121) })
            )
        ).status
    ).toBe(400);
    expect(
        (await fixture.postStart(runner, fixture.startBody({ nonce: 'bad-say', content: '' })))
            .status
    ).toBe(400);
    const unknownTarget = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'bad-target', target: '#nowhere' })
    );
    expect(unknownTarget.status).toBe(404);
    expect(unknownTarget.body.code).toBe('INVALID_TARGET');
    expect((await fixture.postStart(null, fixture.startBody({ nonce: 'no-runner' }))).status).toBe(
        401
    );

    // A different work under a used nonce is a conflict, not a second Message.
    expect(
        (
            await fixture.postStart(
                runner,
                fixture.startBody({ nonce: 'cloud-create', title: 'Something else' })
            )
        ).status
    ).toBe(409);
    expect(await fixture.countWork()).toBe(before);
});

test('reference expansion rejects oversized content before creating work', async () => {
    const runner = await fixture.mintRunner('run_cloud_expansion');
    const before = await fixture.countWork();
    const result = await fixture.postStart(
        runner,
        fixture.startBody({
            nonce: 'cloud-expansion',
            content: `${'x'.repeat(31_995)} @ada`,
        })
    );
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('INVALID_ARG');
    expect(await fixture.countWork()).toBe(before);
});

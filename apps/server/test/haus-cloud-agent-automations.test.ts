import { expect, test } from 'bun:test';
import { agentCloudAgentReceiptSchema } from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';
import { cloudAgentLinkHelpers } from './cloud-agent-link-helpers.ts';

const fixture = cloudAgentFixture();
const input = (history = false) => ({
    agentId: fixture.orbitAgentId,
    history,
    serverId: fixture.serverId,
});

async function start(nonce: string) {
    const runner = await fixture.mintRunner(`run_${nonce}`);
    await fixture.readTarget(runner, '#product');
    return agentCloudAgentReceiptSchema.parse(
        (await fixture.postStart(runner, fixture.startBody({ nonce }))).body
    );
}

test('automations follow durable work and per-Run inbox handoffs without creating Triggers', async () => {
    const created = await start('automation_handoff');
    const list = () => fixture.owner.trpc.cloudAgentWork.listAutomations.query(input());
    expect((await list()).find((row) => row.work.id === created.work.id)).toMatchObject({
        notification: 'waiting',
        conversationChatId: fixture.channelId,
        location: { kind: 'work-thread' },
    });
    expect(await fixture.outsider.trpc.cloudAgentWork.listAutomations.query(input())).toEqual([]);
    const socket = await fixture.attachComputer();
    const observation = {
        observedAt: '2026-10-20T19:00:00.000Z',
        runId: created.runId,
        status: 'completed',
        workId: created.work.id,
    };
    socket.send(JSON.stringify({ observation, type: 'cloud-agent-observation' }));
    await fixture.waitForWorkStatus(created.work.id, 'completed');
    socket.send(JSON.stringify({ observation, type: 'cloud-agent-observation' }));
    expect((await list()).find((row) => row.work.id === created.work.id)?.notification).toBe(
        'pending'
    );
    const inbox = await fixture.harness.sql`
        select id from agent_inbox where server_id = ${fixture.serverId}
            and source = 'cloud_agent_work' and dedupe_key = ${created.runId}
    `;
    expect(inbox).toHaveLength(1);
    await fixture.harness.sql`
        update agent_inbox set state = 'seen', seen_at = now()
        where server_id = ${fixture.serverId} and dedupe_key = ${created.runId}
    `;
    expect((await list()).find((row) => row.work.id === created.work.id)).toBeUndefined();
    expect(
        (await fixture.owner.trpc.cloudAgentWork.listAutomations.query(input(true))).find(
            (row) => row.work.id === created.work.id
        )?.notification
    ).toBe('delivered');
    socket.close();
});

test('deleting the requesting Chat disables its future wake without moving it to another link', async () => {
    const links = cloudAgentLinkHelpers(fixture);
    const source = await links.createChannel('temporary-work');
    const runner = await fixture.mintRunner('run_automation_deleted_chat');
    const created = agentCloudAgentReceiptSchema.parse(
        (
            await fixture.postStart(
                runner,
                fixture.startBody({ nonce: 'automation_deleted_chat', target: '#temporary-work' })
            )
        ).body
    );
    await links.humanSend(
        fixture.owner,
        fixture.channelId,
        `[Work](cloud-agent://${created.work.id})`,
        'automation-alternate-link'
    );
    await fixture.owner.trpc.chat.deleteChannel.mutate({
        chatId: source,
        confirmation: 'temporary-work',
        serverId: fixture.serverId,
    });
    const history = await fixture.owner.trpc.cloudAgentWork.listAutomations.query(input(true));
    expect(history.find((row) => row.work.id === created.work.id)).toMatchObject({
        notification: 'chat-removed',
        conversationChatId: fixture.channelId,
        location: { kind: 'message', chatId: fixture.channelId },
    });
    expect(
        (await fixture.owner.trpc.cloudAgentWork.listAutomations.query(input())).some(
            (row) => row.work.id === created.work.id
        )
    ).toBe(false);
});

test('reassignment preserves the original tracking Computer; a missing Computer goes to history', async () => {
    const created = await start('automation_removed');
    const list = () => fixture.owner.trpc.cloudAgentWork.listAutomations.query(input());
    await fixture.harness.sql`
        update computers set health = 'offline' where id = ${fixture.computerId}
    `;
    expect((await list()).find((row) => row.work.id === created.work.id)).toMatchObject({
        computerHealth: 'offline',
        notification: 'waiting',
    });
    const newComputerId = `cmp_${'n'.repeat(16)}`;
    await fixture.harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash)
        values (${newComputerId}, ${fixture.serverId}, ${fixture.ownerUserId}, ${'9'.repeat(64)})
    `;
    await fixture.harness.sql`
        update agents set computer_id = ${newComputerId} where id = ${fixture.orbitAgentId}
    `;
    expect((await list()).find((row) => row.work.id === created.work.id)?.work.computerId).toBe(
        fixture.computerId
    );
    await fixture.owner.trpc.computer.remove.mutate({
        computerId: fixture.computerId,
        confirmation: 'REMOVE',
        serverId: fixture.serverId,
    });
    expect((await list()).find((row) => row.work.id === created.work.id)).toBeUndefined();
    expect(
        (await fixture.owner.trpc.cloudAgentWork.listAutomations.query(input(true))).find(
            (row) => row.work.id === created.work.id
        )?.notification
    ).toBe('computer-removed');
});

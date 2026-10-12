import { beforeAll, expect, test } from 'bun:test';
import { type CloudAgentWork, formatCloudAgentWorkLink } from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';
import { cloudAgentLinkHelpers } from './cloud-agent-link-helpers.ts';

const fixture = cloudAgentFixture();
const links = cloudAgentLinkHelpers(fixture);
const ghost = 'caw_ghostghostghost1';
let work: CloudAgentWork;
let second: CloudAgentWork;
let techOpsId: string;
let outsiderUserId: string;

beforeAll(async () => {
    outsiderUserId = await fixture.readUserId('user_cloud_outsider');
    const runner = await fixture.mintRunner('run_link_authz');
    work = (await fixture.postStart(runner, fixture.startBody({ nonce: 'link-authz-one' }))).body
        .work as CloudAgentWork;
    second = (
        await fixture.postStart(
            runner,
            fixture.startBody({ nonce: 'link-authz-two', title: 'Second job' })
        )
    ).body.work as CloudAgentWork;
    // The outsider joins #tech-ops but not #product, where the work was launched.
    techOpsId = await links.createChannel('tech-ops', [fixture.peerUserId, outsiderUserId]);
});

test('a human links only work they can already see; unknown ids become plain text', async () => {
    const unseen = await links.humanSend(
        fixture.outsider,
        techOpsId,
        `Is this done? [Fix it](cloud-agent://${work.id})`,
        'outsider-unseen'
    );
    expect(unseen.message.content).toBe('Is this done? Fix it');
    expect(unseen.message.cloudAgentWork).toEqual([]);
    expect(await links.linkRows(unseen.message.id)).toEqual([]);

    const sent = await links.humanSend(
        fixture.owner,
        techOpsId,
        `Moved here: [B](cloud-agent://${second.id}) [A](cloud-agent://${work.id}) [B again](cloud-agent://${second.id}) [Nope](cloud-agent://${ghost})`,
        'owner-links'
    );
    expect(sent.message.content).toBe(
        `Moved here: [B](cloud-agent://${second.id}) [A](cloud-agent://${work.id}) [B again](cloud-agent://${second.id}) Nope`
    );
    expect(sent.message.cloudAgentWork.map(({ id }) => id)).toEqual([second.id, work.id]);
    expect(await links.linkRows(sent.message.id)).toEqual([
        { chat_id: techOpsId, ordinal: 0, work_id: second.id },
        { chat_id: techOpsId, ordinal: 1, work_id: work.id },
    ]);

    // The link is now visible to everyone in #tech-ops, including the outsider.
    const listed = await fixture.outsider.trpc.cloudAgentWork.listForChat.query({
        chatId: techOpsId,
        serverId: fixture.serverId,
    });
    expect(listed.map((row) => [row.anchorMessageId, row.work.id])).toEqual([
        [sent.message.id, second.id],
        [sent.message.id, work.id],
    ]);
});

test('an Agent send and both Task creators run the same link check', async () => {
    const runner = await fixture.mintRunner('run_link_agent');
    const agentSent = await links.sendAsAgent(
        runner,
        '#tech-ops',
        `Tracking ${formatCloudAgentWorkLink(work.title, work.id)} and [Gone](cloud-agent://${ghost})`,
        'agent-links'
    );
    expect(agentSent.message.content).toBe(
        `Tracking [${work.title}](cloud-agent://${work.id}) and Gone`
    );
    expect(await linkedIds(agentSent.message.id)).toEqual([work.id]);

    const humanTask = await fixture.owner.trpc.task.create.mutate({
        chatId: techOpsId,
        content: `Review [A](cloud-agent://${work.id}) and [Gone](cloud-agent://${ghost})`,
        nonce: 'human-task-link',
        serverId: fixture.serverId,
    });
    expect(await linkedIds(humanTask.task.messageId)).toEqual([work.id]);
    const replayedTask = await fixture.owner.trpc.task.create.mutate({
        chatId: techOpsId,
        content: `Review [A](cloud-agent://${work.id}) and [Gone](cloud-agent://${ghost})`,
        nonce: 'human-task-link',
        serverId: fixture.serverId,
    });
    expect(replayedTask.idempotent).toBe(true);

    await fixture.readTarget(runner, '#tech-ops');
    const taskBody = {
        nonce: 'agent-task-link',
        target: '#tech-ops',
        titles: [`Ship [B](cloud-agent://${second.id}) not [Gone](cloud-agent://${ghost})`],
    };
    const agentTask = await links.agentPost(runner, '/api/agent/tasks/create', taskBody);
    expect(agentTask.status).toBe(200);
    const [taskRow] = (await fixture.harness.sql`
        select id, content from chat_messages
        where server_id = ${fixture.serverId} and nonce = 'agent-task-link:0'
    `) as { content: string; id: string }[];
    expect(taskRow?.content).toBe(`Ship [B](cloud-agent://${second.id}) not Gone`);
    expect(await linkedIds(taskRow?.id ?? '')).toEqual([second.id]);
    expect((await links.agentPost(runner, '/api/agent/tasks/create', taskBody)).status).toBe(200);
});

test('a launch keeps authored links and appends its own trusted link last', async () => {
    const runner = await fixture.mintRunner('run_link_launch');
    await fixture.readTarget(runner, '#product');
    const body = fixture.startBody({
        content: `Follow-up to [A](cloud-agent://${work.id}) and [Gone](cloud-agent://${ghost}).`,
        nonce: 'link-launch',
        title: 'Third ] job',
    });
    const launched = await fixture.postStart(runner, body);
    expect(launched.status).toBe(200);
    const launchedWork = launched.body.work as CloudAgentWork;
    const [stored] = (await fixture.harness.sql`
        select content, body_kind from chat_messages where id = ${launched.body.messageId}
    `) as { body_kind: string; content: string }[];
    expect(stored).toEqual({
        body_kind: 'text',
        content: `Follow-up to [A](cloud-agent://${work.id}) and Gone.\n\n[Third  job](cloud-agent://${launchedWork.id})`,
    });
    expect(await linkedIds(launched.body.messageId ?? '')).toEqual([work.id, launchedWork.id]);
    const replay = await fixture.postStart(runner, body);
    expect(replay.body).toMatchObject({ idempotent: true, work: { id: launchedWork.id } });
    const changed = await fixture.postStart(runner, { ...body, content: 'Different words.' });
    expect(changed.status).toBe(409);
});

test('replay compares against the links the send recorded, not current access', async () => {
    const runner = await fixture.mintRunner('run_link_replay');
    await fixture.readTarget(runner, '#product');
    const fresh = (
        await fixture.postStart(
            runner,
            fixture.startBody({ nonce: 'link-replay-work', title: 'Fresh job' })
        )
    ).body.work as CloudAgentWork;
    const stripped = `Seen this? [Fix it](cloud-agent://${fresh.id})`;
    const sideId = await links.createChannel('side-room', [outsiderUserId]);
    const first = await links.humanSend(fixture.outsider, sideId, stripped, 'outsider-retry');
    expect(first.message.content).toBe('Seen this? Fix it');

    // The owner links it where the outsider reads; the outsider's retry stays stripped.
    await links.humanSend(
        fixture.owner,
        sideId,
        `[Fresh](cloud-agent://${fresh.id})`,
        'owner-shares-fresh'
    );
    const retried = await links.humanSend(fixture.outsider, sideId, stripped, 'outsider-retry');
    expect(retried.idempotent).toBe(true);
    expect(retried.message.content).toBe('Seen this? Fix it');
    expect(await links.linkRows(first.message.id)).toEqual([]);

    const linked = `Linked [A](cloud-agent://${work.id})`;
    const kept = await links.humanSend(fixture.owner, sideId, linked, 'owner-retry');
    await fixture.harness.sql`update cloud_agent_work set title = 'Renamed' where id = ${work.id}`;
    const again = await links.humanSend(fixture.owner, sideId, linked, 'owner-retry');
    expect(again).toMatchObject({ idempotent: true, message: { id: kept.message.id } });
    await expect(
        links.humanSend(fixture.owner, sideId, 'Something else', 'owner-retry')
    ).rejects.toThrow(/nonce/i);
});

async function linkedIds(messageId: string) {
    return (await links.linkRows(messageId)).map((row) => row.work_id);
}

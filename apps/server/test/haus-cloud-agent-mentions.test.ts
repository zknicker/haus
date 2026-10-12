import { beforeAll, expect, test } from 'bun:test';
import { type CloudAgentWork, formatCloudAgentWorkLink } from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();
let forgeAgentId: string;

beforeAll(async () => {
    forgeAgentId = (
        await fixture.owner.trpc.agent.create.mutate({
            computerId: fixture.computerId,
            displayName: 'Forge',
            handle: 'forge',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId: fixture.serverId,
        })
    ).agent.id;
    await fixture.harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${fixture.serverId}, ${fixture.channelId}, ${forgeAgentId})
    `;
});

test('a work title naming @forge links the work without mentioning Forge', async () => {
    const runner = await fixture.mintRunner('run_cloud_title_mention');
    const created = await fixture.postStart(
        runner,
        fixture.startBody({
            content: 'Handing this to a cloud agent.',
            nonce: 'cloud-title-mention',
            title: 'Ask @forge about the flaky test',
        })
    );
    expect(created.status).toBe(200);
    const work = created.body.work as CloudAgentWork;

    expect(await readContent(created.body.messageId)).toBe(
        `Handing this to a cloud agent.\n\n${formatCloudAgentWorkLink(work.title, work.id)}`
    );
    // Forge still hears the Channel ambiently, but is not named personally.
    expect(await readInbox(created.body.messageId)).toEqual([
        {
            agent_id: forgeAgentId,
            content: await readContent(created.body.messageId),
            mentioned: false,
        },
    ]);
});

test('authored words at the limit reach the Channel without the Server link', async () => {
    const runner = await fixture.mintRunner('run_cloud_capped_delivery');
    const words = 'x'.repeat(32_000);
    const created = await fixture.postStart(
        runner,
        fixture.startBody({
            content: words,
            nonce: 'cloud-capped-delivery',
            title: 'Ask @orbit and @forge',
        })
    );
    expect(created.status).toBe(200);
    const work = created.body.work as CloudAgentWork;

    expect(await readContent(created.body.messageId)).toBe(
        `${words}\n\n${formatCloudAgentWorkLink(work.title, work.id)}`
    );
    expect(await readInbox(created.body.messageId)).toEqual([
        { agent_id: forgeAgentId, content: words, mentioned: false },
    ]);
});

async function readContent(messageId: string | undefined) {
    const [row] = (await fixture.harness.sql`
        select content from chat_messages where server_id = ${fixture.serverId} and id = ${messageId ?? ''}
    `) as { content: string }[];
    return row?.content;
}

async function readInbox(messageId: string | undefined) {
    return await fixture.harness.sql`
        select agent_id, content, mentioned from agent_inbox
        where server_id = ${fixture.serverId} and dedupe_key = ${messageId ?? ''}
        order by agent_id
    `;
}

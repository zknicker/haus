import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('a created Agent lands in #all plus every channel the request named', async () => {
    const runner = await fixture.mintRunner('run_create_channels');

    const created = await fixture.postCreate(
        runner,
        fixture.createBody({
            channels: ['#product'],
            displayName: 'Compass',
            nonce: 'create-channels',
        })
    );

    expect(created.status).toBe(200);
    // `#all` first, because that membership is the Server's own guarantee.
    expect(created.body.channels).toEqual(['#all', '#product']);
    expect(await readChannelNames(created.body.agent?.agentId ?? '')).toEqual(['all', 'product']);
});

test('an Agent created with no --channel still belongs to #all', async () => {
    const runner = await fixture.mintRunner('run_create_all_only');

    const created = await fixture.postCreate(
        runner,
        fixture.createBody({ displayName: 'Lantern', nonce: 'create-all-only' })
    );

    expect(created.status).toBe(200);
    expect(created.body.channels).toEqual(['#all']);
});

test('a human-created Agent joins #all through the same seam', async () => {
    const agentId = await fixture.createAgent('Ledger', 'ledger');

    expect(await readChannelNames(agentId)).toEqual(['all']);
});

test('a channel that does not exist refuses the whole creation before generation', async () => {
    fixture.setAvatarMode('success');
    const runner = await fixture.mintRunner('run_create_bad_channel');
    const before = fixture.avatarRequests.length;

    const created = await fixture.postCreate(
        runner,
        fixture.createBody({
            avatarConcept: 'a paper lantern',
            channels: ['#nowhere'],
            displayName: 'Drift',
            nonce: 'create-bad-channel',
        })
    );

    expect(created.status).toBe(404);
    expect(created.body.code).toBe('INVALID_TARGET');
    expect(created.body.message).toContain('#nowhere');
    // Nothing was written and no generation was spent on a request that cannot land.
    expect(fixture.avatarRequests.length).toBe(before);
    expect(await readAgentIdByHandle('drift')).toBeNull();
});

test('an archived channel is refused the same way', async () => {
    const channel = await fixture.owner.trpc.chat.createChannel.mutate({
        agentIds: [fixture.peerAgentId],
        name: 'retired-lane',
        serverId: fixture.serverId,
    });
    await fixture.owner.trpc.chat.archiveChannel.mutate({
        chatId: channel.id,
        serverId: fixture.serverId,
    });
    const runner = await fixture.mintRunner('run_create_archived_channel');

    const created = await fixture.postCreate(
        runner,
        fixture.createBody({
            channels: ['#retired-lane'],
            displayName: 'Anchor',
            nonce: 'create-archived-channel',
        })
    );

    expect(created.status).toBe(404);
    expect(created.body.code).toBe('INVALID_TARGET');
    expect(await readAgentIdByHandle('anchor')).toBeNull();
});

test('the brief is stored on the Agent row, not sent as a Message', async () => {
    const runner = await fixture.mintRunner('run_create_brief');
    const brief = 'Own the delivery lane. Post a Friday digest in #product; @ada reviews it.';

    const created = await fixture.postCreate(
        runner,
        fixture.createBody({ brief, displayName: 'Beacon', nonce: 'create-brief' })
    );

    expect(created.status).toBe(200);
    const agentId = created.body.agent?.agentId ?? '';
    const [row] = (await fixture.harness.sql`
        select brief from agents where id = ${agentId}
    `) as { brief: string | null }[];
    expect(row.brief).toBe(brief);

    // The brief is memory, not conversation; creation posts nothing.
    const page = await fixture.owner.trpc.chat.messages.query({
        chatId: fixture.channelId,
        limit: 50,
        serverId: fixture.serverId,
    });
    expect(page.messages.filter((message) => message.content.includes(brief))).toHaveLength(0);
});

test('an Agent creation without a brief is rejected before creating a row', async () => {
    const runner = await fixture.mintRunner('run_create_no_brief');

    const created = await fixture.postCreate(
        runner,
        fixture.createBody({ displayName: 'Quill', nonce: 'create-no-brief', brief: null })
    );

    expect(created.status).toBe(400);
    expect(created.body.code).toBe('INVALID_ARG');
    const rows = await fixture.harness.sql`
        select id from agents where server_id = ${fixture.serverId} and display_name = 'Quill'
    `;
    expect(rows).toHaveLength(0);
});

async function readChannelNames(agentId: string) {
    const rows = (await fixture.harness.sql`
        select c.name
        from channel_agent_participants p
        join chats c on c.server_id = p.server_id and c.id = p.chat_id
        where p.server_id = ${fixture.serverId} and p.agent_id = ${agentId}
        order by c.name
    `) as { name: string }[];
    return rows.map((row) => row.name);
}

async function readAgentIdByHandle(handle: string) {
    const [row] = (await fixture.harness.sql`
        select id from agents where server_id = ${fixture.serverId} and handle = ${handle}
    `) as { id: string }[];
    return row?.id ?? null;
}

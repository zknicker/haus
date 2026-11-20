import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { createTestProject } from './project.fixture.ts';

const fixture = agentCreationFixture();

test('a created Agent lives in the Project its request names', async () => {
    const runner = await fixture.mintRunner('run_create_home');
    const product = await readProjectKey(fixture.channelId);

    const created = await fixture.postCreate(
        runner,
        fixture.createBody({
            displayName: 'Compass',
            nonce: 'create-home',
            project: product.toLowerCase(),
        })
    );

    expect(created.status).toBe(200);
    expect(created.body.project).toBe(product);
    expect(await readHome(created.body.agent?.agentId ?? '')).toBe(fixture.channelId);
});

test('an Agent created with no --project lives in its creator’s home Project', async () => {
    const runner = await fixture.mintRunner('run_create_creator_home');

    const created = await fixture.postCreate(
        runner,
        fixture.createBody({ displayName: 'Lantern', nonce: 'create-creator-home' })
    );

    expect(created.status).toBe(200);
    expect(created.body.project).toBe(await readProjectKey(fixture.channelId));
    expect(await readHome(created.body.agent?.agentId ?? '')).toBe(fixture.channelId);
});

test('no --project is refused when the creator lives in #all, which is no Project', async () => {
    const creator = await fixture.createAgent('Hermit', 'hermit');
    await fixture.harness.sql`
        update agents set home_project_id = ${await readAllChannelId()} where id = ${creator}
    `;
    const runner = await fixture.mintRunner('run_create_from_all', creator);

    const created = await fixture.postCreate(
        runner,
        fixture.createBody({ displayName: 'Wisp', nonce: 'create-from-all' })
    );

    expect(created.status).toBe(404);
    expect(created.body).toMatchObject({
        code: 'INVALID_TARGET',
        message: 'Your Project is not open, so the new Agent cannot join it. Pass --project <KEY>.',
    });
    expect(await readAgentIdByHandle('wisp')).toBeNull();
});

test('agent.create without a home Project is refused by input validation', async () => {
    await expect(
        fixture.owner.trpc.agent.create.mutate({
            computerId: fixture.computerId,
            displayName: 'Ledger',
            handle: 'ledger',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId: fixture.serverId,
        } as Parameters<typeof fixture.owner.trpc.agent.create.mutate>[0])
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
    expect(await readAgentIdByHandle('ledger')).toBeNull();
});

test('agent.create homes the Agent in the Project it names', async () => {
    const created = await fixture.owner.trpc.agent.create.mutate({
        computerId: fixture.computerId,
        displayName: 'Tally',
        handle: 'tally',
        homeProjectId: fixture.channelId,
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: fixture.serverId,
    });

    expect(await readHome(created.agent.id)).toBe(fixture.channelId);
});

test('agent.create refuses #all and an archived Project as a home', async () => {
    const archived = await createTestProject(fixture.owner, {
        agentIds: [],
        key: 'OLD',
        name: 'old-lane',
        serverId: fixture.serverId,
    });
    await fixture.owner.trpc.chat.archiveChannel.mutate({
        chatId: archived.id,
        serverId: fixture.serverId,
    });

    for (const [handle, homeProjectId, refusal] of [
        ['allie', await readAllChannelId(), 'That Project does not exist on this Server.'],
        ['olde', archived.id, 'This channel is archived. Restore it before adding new work.'],
    ] as const) {
        await expect(
            fixture.owner.trpc.agent.create.mutate({
                computerId: fixture.computerId,
                displayName: handle,
                handle,
                homeProjectId,
                modelId: 'gpt-5.6-sol',
                runtimeId: 'codex',
                serverId: fixture.serverId,
            })
        ).rejects.toThrow(refusal);
        expect(await readAgentIdByHandle(handle)).toBeNull();
    }
});

test('Cove always lives in the Haus project', async () => {
    await expect(
        fixture.owner.trpc.agent.setHome.mutate({
            agentId: fixture.coveAgentId,
            projectId: fixture.channelId,
            serverId: fixture.serverId,
        })
    ).rejects.toEqual(
        expect.objectContaining({
            data: expect.objectContaining({ project: { code: 'COVE_HOME_FIXED' } }),
        })
    );
    expect(await readHome(fixture.coveAgentId)).toBe(await readAllChannelId());
});

test('a Project key that names nothing refuses the whole creation before generation', async () => {
    fixture.setAvatarMode('success');
    const runner = await fixture.mintRunner('run_create_bad_home');
    const before = fixture.avatarRequests.length;

    const created = await fixture.postCreate(
        runner,
        fixture.createBody({
            avatarConcept: 'a paper lantern',
            displayName: 'Drift',
            nonce: 'create-bad-home',
            project: 'NOPE',
        })
    );

    expect(created.status).toBe(404);
    expect(created.body.code).toBe('INVALID_TARGET');
    expect(created.body.message).toContain('NOPE');
    expect(fixture.avatarRequests.length).toBe(before);
    expect(await readAgentIdByHandle('drift')).toBeNull();
});

test('an archived Project is refused the same way', async () => {
    const channel = await createTestProject(fixture.owner, {
        agentIds: [],
        key: 'RET',
        name: 'retired-lane',
        serverId: fixture.serverId,
    });
    await fixture.owner.trpc.chat.archiveChannel.mutate({
        chatId: channel.id,
        serverId: fixture.serverId,
    });
    const runner = await fixture.mintRunner('run_create_archived_home');

    const created = await fixture.postCreate(
        runner,
        fixture.createBody({
            displayName: 'Anchor',
            nonce: 'create-archived-home',
            project: 'RET',
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

async function readHome(agentId: string) {
    const [row] = (await fixture.harness.sql`
        select home_project_id from agents where id = ${agentId}
    `) as { home_project_id: string }[];
    return row?.home_project_id ?? null;
}

async function readAllChannelId() {
    const [row] = (await fixture.harness.sql`
        select id from chats where server_id = ${fixture.serverId} and is_all
    `) as { id: string }[];
    return row?.id ?? null;
}

async function readProjectKey(chatId: string) {
    const [row] = (await fixture.harness.sql`
        select task_keys.key from projects
        join task_keys on task_keys.server_id = projects.server_id
            and task_keys.id = projects.task_key_id
        where projects.chat_id = ${chatId}
    `) as { key: string }[];
    if (!row) {
        throw new Error(`Chat ${chatId} is not a Project.`);
    }
    return row.key;
}

async function readAgentIdByHandle(handle: string) {
    const [row] = (await fixture.harness.sql`
        select id from agents where server_id = ${fixture.serverId} and handle = ${handle}
    `) as { id: string }[];
    return row?.id ?? null;
}

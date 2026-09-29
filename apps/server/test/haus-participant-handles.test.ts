import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readAgentServerDirectory } from '../src/agent-api/directory.ts';
import { messageSelection, targetForChat, toAgentMessages } from '../src/agent-api/message-view.ts';
import { resolveAgentSendTarget } from '../src/agent-api/resolve-send-target.ts';
import { resolveAgentTarget } from '../src/agent-api/resolve-target.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { chatMessagesTable } from '../src/postgres/schema.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let connection: HausConnection;
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let ownerUserId: string;
let agentId: string;
let dmChatId: string;

const computerId = 'cmp_handle_namespace';

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(
        harness,
        await harness.clerk.mintSessionToken('user_handle_namespace')
    );
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Handle HQ',
        slug: 'handle-hq',
    });
    serverId = server.id;
    ownerUserId = server.viewerUserId;

    await owner.trpc.member.syncIdentity.mutate({
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        serverId,
    });
    await owner.trpc.member.updateProfile.mutate({
        description: 'Builds precise machines.',
        displayName: 'Ada Lovelace',
        serverId,
    });
    await harness.sql`
        insert into computers (
            id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
        ) values (
            ${computerId},
            ${serverId},
            ${ownerUserId},
            ${'a'.repeat(64)},
            ${{
                runtimes: [
                    {
                        id: 'codex',
                        label: 'Codex',
                        models: [{ id: 'gpt-test', label: 'GPT Test' }],
                    },
                ],
            }}::jsonb,
            'healthy'
        )
    `;
    const created = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Wren',
        handle: 'wren',
        modelId: 'gpt-test',
        runtimeId: 'codex',
        serverId,
    });
    agentId = created.agent.id;
    dmChatId = (await owner.trpc.chat.ensureAgentDm.mutate({ agentId, serverId })).id;
});

afterAll(async () => {
    owner.close();
    await connection.close();
    await harness.close();
});

test('keeps display name separate from the Server-scoped human handle', async () => {
    await owner.trpc.member.updateProfile.mutate({
        description: 'Builds precise machines.',
        displayName: 'Ada Byron',
        serverId,
    });

    const directory = await owner.trpc.member.list.query({ serverId });
    expect(directory.members.find(({ userId }) => userId === ownerUserId)).toMatchObject({
        displayName: 'Ada Byron',
        handle: 'ada-lovelace',
    });
});

test('rejects human-Agent collisions case-insensitively in both claim directions', async () => {
    await expect(
        owner.trpc.member.updateProfile.mutate({
            description: 'Builds precise machines.',
            displayName: 'Ada Byron',
            handle: 'WREN',
            serverId,
        })
    ).rejects.toThrow(/already taken/i);

    await expect(
        owner.trpc.agent.create.mutate({
            computerId,
            displayName: 'Other Ada',
            handle: 'ADA-LOVELACE',
            modelId: 'gpt-test',
            runtimeId: 'codex',
            serverId,
        })
    ).rejects.toThrow(/already taken/i);
});

test('projects the real human handle into Agent-facing messages and DM targets', async () => {
    const [message] = await connection.db
        .insert(chatMessagesTable)
        .values({
            authorUserId: ownerUserId,
            chatId: dmChatId,
            content: 'Use my real handle.',
            id: 'msg_real_human_handle',
            nonce: 'real-human-handle',
            sequence: 1,
            serverId,
        })
        .returning(messageSelection);
    const [projected] = await toAgentMessages(connection.db, serverId, [message]);

    expect(projected).toMatchObject({
        author: { id: ownerUserId, label: 'Ada Byron' },
        sender: {
            description: 'Builds precise machines.',
            handle: 'ada-lovelace',
            type: 'human',
        },
    });
    expect(await targetForChat(connection.db, serverId, dmChatId)).toBe('dm:@ada-lovelace');
    const runner = {
        agentId,
        capabilities: [],
        chatId: dmChatId,
        computerId,
        runId: 'run_handle_projection',
        runnerId: 'arc_handle_projection',
        serverId,
    };
    expect(await resolveAgentTarget(connection.db, runner, 'dm:@ADA-LOVELACE')).toBe(dmChatId);
    expect(
        await readAgentServerDirectory(connection.db, runner, {
            agents: false,
            channels: false,
            humans: true,
            joined: false,
            limit: 10,
            offset: 0,
        })
    ).toMatchObject({
        humans: [
            { description: 'Builds precise machines.', handle: 'ada-lovelace', id: ownerUserId },
        ],
    });
});

test('an Agent send target materializes the addressed human pair by handle', async () => {
    const targetUserId = 'usr_handle_target';
    await harness.sql`
        insert into users (id, clerk_user_id, display_name)
        values (${targetUserId}, 'user_handle_target', 'Grace Hopper')
    `;
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role, handle)
        values ('mem_handle_target', ${serverId}, ${targetUserId}, 'member', 'grace-hopper')
    `;
    const runner = {
        agentId,
        capabilities: [],
        chatId: dmChatId,
        computerId,
        runId: 'run_handle_materialize',
        runnerId: 'arc_handle_materialize',
        serverId,
    };

    const chatId = await connection.db.transaction((tx) =>
        resolveAgentSendTarget(tx, runner, 'dm:@GRACE-HOPPER')
    );
    const rows = await harness.sql`
        select dm_agent_id, dm_member_one_user_id from chats
        where server_id = ${serverId} and id = ${chatId}
    `;
    expect(rows).toEqual([{ dm_agent_id: agentId, dm_member_one_user_id: targetUserId }]);
});

test('human autocomplete addresses the immutable user id while exposing handle search metadata', async () => {
    const options = await owner.trpc.chat.mentionOptions.query({
        chatId: dmChatId,
        serverId,
    });

    expect(options.options).toContainEqual(
        expect.objectContaining({
            id: `user://${ownerUserId}`,
            insertText: '@Ada Byron',
            kind: 'user',
            label: 'Ada Byron',
            metadata: expect.objectContaining({ userHandle: 'ada-lovelace' }),
            projection: 'user-reference',
            sourceLabel: 'Humans',
        })
    );
});

test('channel autocomplete offers visible channels with chat-reference metadata', async () => {
    const options = await owner.trpc.chat.mentionOptions.query({
        chatId: dmChatId,
        serverId,
    });

    const channelOption = options.options.find((option) => option.label === 'all');
    expect(channelOption).toMatchObject({
        insertText: '#all',
        kind: 'chat',
        label: 'all',
        projection: 'chat-reference',
        sourceLabel: 'Channels',
    });
    expect(channelOption?.metadata).toHaveProperty('chatColor');
    expect(channelOption?.metadata).toHaveProperty('chatIcon');
});

test('releases a human handle on departure while historical authorship stays id-bound', async () => {
    await harness.sql`
        update server_memberships
        set revoked_at = now()
        where server_id = ${serverId} and user_id = ${ownerUserId}
    `;
    const [released] = (await harness.sql`
        select handle from server_memberships
        where server_id = ${serverId} and user_id = ${ownerUserId}
    `) as Array<{ handle: string | null }>;
    const [historical] = (await harness.sql`
        select author_user_id from chat_messages where id = 'msg_real_human_handle'
    `) as Array<{ author_user_id: string }>;

    expect(released?.handle).toBeNull();
    expect(historical?.author_user_id).toBe(ownerUserId);
});

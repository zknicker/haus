import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readAgentServerDirectory } from '../src/agent-api/directory.ts';
import { messageSelection, targetForChat, toAgentMessages } from '../src/agent-api/message-view.ts';
import { resolveAgentSendTarget } from '../src/agent-api/resolve-send-target.ts';
import { resolveAgentTarget } from '../src/agent-api/resolve-target.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { chatMessagesTable } from '../src/postgres/schema.ts';
import { createHomedAgent } from './agent-home.fixture.ts';
import { openCaptainChat } from './captain-chat.fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let connection: HausConnection;
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let ownerUserId: string;
let agentId: string;
let captainChatId: string;

const computerId = 'cmp_handle_namespace';

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_handle_namespace')
    );
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Handle HQ',
        slug: 'handle-hq',
    });
    serverId = server.id;
    ownerUserId = server.viewerUserId;

    await owner.trpc.member.syncIdentity.mutate({
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
                        models: [{ id: 'gpt-5.6-sol', label: 'GPT Test' }],
                    },
                ],
            }}::jsonb,
            'healthy'
        )
    `;
    const created = await createHomedAgent(owner, {
        computerId,
        displayName: 'Wren',
        handle: 'wren',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    agentId = created.agent.id;
    captainChatId = (await openCaptainChat(owner, { agentId, serverId })).id;
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
        createHomedAgent(owner, {
            computerId,
            displayName: 'Other Ada',
            handle: 'ADA-LOVELACE',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId,
        })
    ).rejects.toThrow(/already taken/i);
});

test('projects the real human handle into Agent-facing messages and Captain targets', async () => {
    const [message] = await connection.db
        .insert(chatMessagesTable)
        .values({
            authorUserId: ownerUserId,
            chatId: captainChatId,
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
    expect(await targetForChat(connection.db, serverId, captainChatId)).toBe('captain:@wren');
    const runner = {
        agentId,
        capabilities: [],
        chatId: captainChatId,
        computerId,
        runId: 'run_handle_projection',
        runnerId: 'arc_handle_projection',
        serverId,
    };
    expect(await resolveAgentTarget(connection.db, runner, 'captain:@WREN')).toBe(captainChatId);
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

test('an Agent has no DM target: a human handle resolves to nothing', async () => {
    const runner = {
        agentId,
        capabilities: [],
        chatId: captainChatId,
        computerId,
        runId: 'run_handle_no_dm',
        runnerId: 'arc_handle_no_dm',
        serverId,
    };
    await expect(
        connection.db.transaction((tx) => resolveAgentSendTarget(tx, runner, 'dm:@ada-lovelace'))
    ).rejects.toThrow('That target does not exist.');
});

test('human autocomplete addresses the immutable user id while exposing handle search metadata', async () => {
    const options = await owner.trpc.chat.mentionOptions.query({
        chatId: captainChatId,
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
        chatId: captainChatId,
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

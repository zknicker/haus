import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createFakeGithub, type FakeGithub, fakeGithubClient } from './github-fake.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

// One Server with a signed-in GitHub connection over a faked GitHub, plus an
// Agent that holds the connection grant and can own `github` Triggers.

export interface GithubFixture {
    agentId: string;
    anchorMessageId: string;
    channelId: string;
    close(): Promise<void>;
    connectionId: string;
    database: HausConnection;
    fake: FakeGithub;
    harness: HausServerHarness;
    owner: HausClient;
    ownerUserId: string;
    serverId: string;
    slug: string;
}

const clientVariables = ['HAUS_GITHUB_APP_CLIENT_ID', 'HAUS_GITHUB_APP_CLIENT_SECRET'] as const;
const codexRuntime = { id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] };

export async function startGithubFixture(name: string): Promise<GithubFixture> {
    const saved = clientVariables.map((variable) => [variable, process.env[variable]] as const);
    process.env.HAUS_GITHUB_APP_CLIENT_ID = fakeGithubClient.id;
    process.env.HAUS_GITHUB_APP_CLIENT_SECRET = fakeGithubClient.secret;
    const fake = await createFakeGithub();
    const harness = await startHausServerHarness({ githubApp: fake.app });
    const database = await connectHausDatabase(harness.databaseUrl);
    const owner = createHausClient(harness, await harness.humans.mintSessionToken(`${name}_owner`));
    const slug = `${name.replaceAll('_', '-')}-hq`;
    const server = await owner.trpc.server.create.mutate({ displayName: 'GitHub HQ', slug });
    const channelId = server.channels[0].id;
    const ownerUserId = await userId(harness, `${name}_owner`);
    const connectionId = await insertGithubConnection(harness, server.id, 'ghu_owner', 'ghr_owner');
    const agentId = await createAgent(harness, owner, server.id, channelId, ownerUserId, name);
    await harness.sql`
        insert into agent_mcp_connection_grants (server_id, agent_id, connection_id)
        values (${server.id}, ${agentId}, ${connectionId})
    `;
    const sent = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Tell me when CI fails',
        nonce: `${name}_anchor`,
        serverId: server.id,
    });
    return {
        agentId,
        anchorMessageId: sent.message.id,
        channelId,
        close: async () => {
            owner.close();
            await database.close();
            await harness.close();
            for (const [variable, value] of saved) {
                if (value === undefined) {
                    delete process.env[variable];
                } else {
                    process.env[variable] = value;
                }
            }
        },
        connectionId,
        database,
        fake,
        harness,
        owner,
        ownerUserId,
        serverId: server.id,
        slug,
    };
}

/** A connected GitHub connection whose stored user token pair is `access`/`refresh`. */
export async function insertGithubConnection(
    harness: HausServerHarness,
    serverId: string,
    access: string,
    refresh: string
): Promise<string> {
    const connectionId = `mcp_${access.replace(/\W/gu, '').padEnd(16, '0').slice(0, 16)}`;
    await harness.sql`
        insert into mcp_connections (id, server_id, name, url, auth, connected, header_names, tools, preset)
        values (${connectionId}, ${serverId}, 'GitHub', 'https://api.githubcopilot.com/mcp/',
                'oauth', true, '{}', '{}', 'github')
    `;
    const secret = {
        approvedAuthorizationServerOrigins: [],
        headers: {},
        oauthScopes: [],
        tokens: {
            access_token: access,
            authorization_server: 'https://github.com/login/oauth',
            refresh_token: refresh,
            token_endpoint: 'https://github.com/login/oauth/access_token',
            token_type: 'bearer',
        },
    };
    await harness.sql`
        insert into mcp_secrets (connection_id, secret) values (${connectionId}, ${secret}::jsonb)
    `;
    return connectionId;
}

/** Inserts an armed `github` Trigger owned by the fixture Agent. */
export async function insertGithubTrigger(
    fixture: GithubFixture,
    input: { id: string; installationRowId: string; repositoryIds?: number[] }
): Promise<void> {
    const at = new Date('2026-10-11T12:00:00.000Z');
    const ids = input.repositoryIds ?? [];
    await fixture.harness.sql`
        insert into triggers
            (id, server_id, owner_agent_id, anchor_chat_id, anchor_message_id, kind, secret_hash,
             status, title, created_at, updated_at)
        values (${input.id}, ${fixture.serverId}, ${fixture.agentId}, ${fixture.channelId},
                ${fixture.anchorMessageId}, 'github', null, 'armed', 'CI failed', ${at}, ${at})
    `;
    await fixture.harness.sql`
        insert into github_trigger_configs
            (trigger_id, server_id, installation_row_id, repository_scope, repository_ids,
             repository_names, events)
        values (${input.id}, ${fixture.serverId}, ${input.installationRowId},
                ${ids.length > 0 ? 'repositories' : 'installation'}, ${`{${ids.join(',')}}`}::bigint[],
                ${`{${ids.map((id) => `acme/repo-${id}`).join(',')}}`}::text[],
                ${[{ actions: ['completed'], event: 'workflow_run' }]}::jsonb)
    `;
}

export async function triggerState(fixture: GithubFixture, triggerId: string) {
    const [row] = (await fixture.harness.sql`
        select config.problem, trigger_row.version
        from github_trigger_configs as config
        inner join triggers as trigger_row on trigger_row.id = config.trigger_id
        where config.trigger_id = ${triggerId}
    `) as { problem: string | null; version: number }[];
    return row;
}

export async function problemNotices(fixture: GithubFixture, triggerId: string) {
    return (await fixture.harness.sql`
        select dedupe_key, content from agent_inbox
        where source = 'trigger_problem' and dedupe_key like ${`problem:${triggerId}:%`}
        order by created_at
    `) as { content: string; dedupe_key: string }[];
}

export async function userId(harness: HausServerHarness, subject: string) {
    const [row] = (await harness.sql`
        select id from users where auth_subject = ${subject}
    `) as { id: string }[];
    if (!row) {
        throw new Error(`No Haus user for ${subject}.`);
    }
    return row.id;
}

async function createAgent(
    harness: HausServerHarness,
    owner: HausClient,
    serverId: string,
    channelId: string,
    ownerUserId: string,
    name: string
) {
    const computerId = `cmp_${name.replace(/\W/gu, '').padEnd(16, '0').slice(0, 16)}`;
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (${computerId}, ${serverId}, ${ownerUserId}, ${'b'.repeat(64)},
                ${{ runtimes: [codexRuntime] }}::jsonb, 'healthy')
    `;
    const created = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Sage',
        handle: 'sage',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${channelId}, ${created.agent.id})
        on conflict do nothing
    `;
    return created.agent.id;
}

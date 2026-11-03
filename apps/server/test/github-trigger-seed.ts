import { signGithubPayload } from '../src/github/webhook-signature.ts';
import { fixtureInstallationId, fixtureRepository } from './github-delivery-fixtures.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import type { HausServerHarness } from './haus-server-harness.ts';

// One Server wired for GitHub Triggers: an Agent in #all with a message to
// anchor on, a connected GitHub connection the Agent holds a grant on, and an
// active installation whose access cache reaches acme/api.

export interface GithubTriggerWorld {
    agentId: string;
    anchorMessageId: string;
    channelId: string;
    connectionId: string;
    installationRowId: string;
    owner: HausClient;
    serverId: string;
    userId: string;
}

const computerId = 'cmp_githubtriggers01';
const credentialHash = 'b'.repeat(64);
const codexRuntime = { id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] };

export async function seedGithubTriggerWorld(
    harness: HausServerHarness,
    slug: string
): Promise<GithubTriggerWorld> {
    const subject = `user_${slug.replaceAll('-', '_')}`;
    const owner = createHausClient(harness, await harness.humans.mintSessionToken(subject));
    const server = await owner.trpc.server.create.mutate({ displayName: 'GitHub', slug });
    const serverId = server.id;
    const channelId = server.channels[0].id;
    const [user] = (await harness.sql`
        select id from users where auth_subject = ${subject}
    `) as { id: string }[];
    const userId = user?.id ?? '';
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (${computerId}, ${serverId}, ${userId}, ${credentialHash}, ${{ runtimes: [codexRuntime] }}::jsonb, 'healthy')
    `;
    const created = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Sage',
        handle: 'sage',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    const agentId = created.agent.id;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${channelId}, ${agentId}) on conflict do nothing
    `;
    const sent = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Tell me when CI fails',
        nonce: `${slug}_anchor`,
        serverId,
    });
    const connectionId = 'mcp_githubtrigger001';
    const installationRowId = 'ghi_githubtrigger001';
    await harness.sql`
        insert into mcp_connections (id, server_id, name, url, auth, connected, header_names, tools, preset)
        values (${connectionId}, ${serverId}, 'GitHub', 'https://api.githubcopilot.com/mcp/',
                'oauth', true, '{}', '{}', 'github')
    `;
    await harness.sql`
        insert into agent_mcp_connection_grants (server_id, agent_id, connection_id)
        values (${serverId}, ${agentId}, ${connectionId})
    `;
    const now = new Date();
    await harness.sql`
        insert into github_installations
            (id, server_id, connection_id, installation_id, account_id, account_login, account_type,
             repository_selection, permissions, events, status, accessible_repository_ids,
             access_synced_at, bound_by_user_id, created_at, updated_at, synced_at)
        values (${installationRowId}, ${serverId}, ${connectionId}, ${fixtureInstallationId}, 99,
                'acme', 'Organization', 'selected',
                ${{ actions: 'write', checks: 'read', contents: 'write', deployments: 'read', issues: 'write', metadata: 'read', pull_requests: 'write' }}::jsonb,
                '{workflow_run,push}', 'active', ${`{${fixtureRepository.id},7002}`}::bigint[],
                ${now}, ${userId}, ${now}, ${now}, ${now})
    `;
    return {
        agentId,
        anchorMessageId: sent.message.id,
        channelId,
        connectionId,
        installationRowId,
        owner,
        serverId,
        userId,
    };
}

let triggerSequence = 0;

/** Inserts an armed `github` Trigger directly, as authoring would store it. */
export async function insertGithubTrigger(
    harness: HausServerHarness,
    world: GithubTriggerWorld,
    input: { events: unknown; repositoryIds?: number[]; title?: string }
): Promise<string> {
    triggerSequence += 1;
    const triggerId = `trg_ghseed${String(triggerSequence).padStart(9, '0')}`;
    const now = new Date();
    const ids = input.repositoryIds ?? [];
    await harness.sql`
        insert into triggers
            (id, server_id, owner_agent_id, anchor_chat_id, anchor_message_id, kind, secret_hash,
             status, title, created_at, updated_at)
        values (${triggerId}, ${world.serverId}, ${world.agentId}, ${world.channelId},
                ${world.anchorMessageId}, 'github', null, 'armed', ${input.title ?? 'CI failed'}, ${now}, ${now})
    `;
    await harness.sql`
        insert into github_trigger_configs
            (trigger_id, server_id, installation_row_id, repository_scope, repository_ids,
             repository_names, events)
        values (${triggerId}, ${world.serverId}, ${world.installationRowId},
                ${ids.length > 0 ? 'repositories' : 'installation'},
                ${`{${ids.join(',')}}`}::bigint[],
                ${`{${ids.map(() => 'acme/api').join(',')}}`}::text[],
                ${input.events}::jsonb)
    `;
    return triggerId;
}

/** POSTs one delivery the way GitHub does, signed with `secret` unless overridden. */
export async function postGithubDelivery(
    harness: HausServerHarness,
    input: {
        body?: string;
        event: string;
        guid: string;
        payload?: unknown;
        secret: string;
        signature?: string | null;
    }
) {
    const body = input.body ?? JSON.stringify(input.payload ?? {});
    const signature =
        input.signature === undefined ? signGithubPayload(input.secret, body) : input.signature;
    const response = await fetch(new URL('/api/github/webhook', harness.url), {
        body,
        headers: {
            'content-type': 'application/json',
            'user-agent': 'GitHub-Hookshot/abc123',
            'x-github-delivery': input.guid,
            'x-github-event': input.event,
            'x-github-hook-installation-target-type': 'integration',
            ...(signature === null ? {} : { 'x-hub-signature-256': signature }),
        },
        method: 'POST',
    });
    return { body: (await response.json()) as Record<string, unknown>, status: response.status };
}

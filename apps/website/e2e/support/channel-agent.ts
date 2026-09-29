import { createHash } from 'node:crypto';
import { assertOpaqueId, createClient, runPsql } from './server.ts';

/**
 * An Agent in one Channel that can post as itself the way a real Agent does:
 * a Server-minted runner credential calling `POST /api/agent/messages/send`.
 * The browser flow under test is the human side of being addressed, so the
 * Agent side stays a real Server call rather than a hand-written row.
 */
export async function createChannelAgent(input: {
    channelName: string;
    databaseUrl: string;
    serverId: string;
    slug: string;
    token: string;
}) {
    // Computer ids and credential hashes are unique across the whole test
    // database, so each Server that seeds one derives its own.
    const agentCredentialHash = createHash('sha256').update(input.serverId).digest('hex');
    const agentComputerId = `cmp_${agentCredentialHash.slice(0, 16)}`;
    const owner = createClient(input.token);
    const server = await owner.server.bySlug.query({ slug: input.slug });
    const chatId = server.channels.find((channel) => channel.name === input.channelName)?.id;
    assertOpaqueId(chatId);
    const ownerUserId = runPsql(
        input.databaseUrl,
        "select id from users where clerk_user_id = 'user_e2e_human'"
    );
    assertOpaqueId(ownerUserId);

    const inventory = {
        runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }],
    };
    runPsql(
        input.databaseUrl,
        `insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
         values ('${agentComputerId}', '${input.serverId}', '${ownerUserId}', '${agentCredentialHash}', '${JSON.stringify(inventory)}'::jsonb, 'healthy')
         on conflict (id) do nothing`
    );
    const created = await owner.agent.create.mutate({
        computerId: agentComputerId,
        displayName: 'Orbit',
        handle: 'orbit',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: input.serverId,
    });
    runPsql(
        input.databaseUrl,
        `insert into channel_agent_participants (server_id, chat_id, agent_id)
         values ('${input.serverId}', '${chatId}', '${created.agent.id}')
         on conflict do nothing`
    );
    const runnerToken = await mintAgentRunner(created.agent.id, chatId, agentCredentialHash);

    return {
        agentId: created.agent.id,
        chatId,
        ownerUserId,
        send: async (content: string, nonce: string) => {
            const response = await fetch(`${hausOrigin()}/api/agent/messages/send`, {
                body: JSON.stringify({ content, nonce, target: `#${input.channelName}` }),
                headers: {
                    authorization: `Bearer ${runnerToken}`,
                    'content-type': 'application/json',
                },
                method: 'POST',
            });
            const payload = (await response.json()) as { state?: string };
            if (response.status !== 200 || payload.state !== 'sent') {
                throw new Error(
                    `The mention fixture could not post as its Agent: ${response.status} ${JSON.stringify(payload)}`
                );
            }
        },
    };
}

async function mintAgentRunner(agentId: string, chatId: string, credentialHash: string) {
    const response = await fetch(`${hausOrigin()}/computer/runner/mint`, {
        body: JSON.stringify({
            agentId,
            chatId,
            credentialHash,
            runId: 'run_e2e_mention',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`The mention fixture could not mint a runner: ${response.status}`);
    }
    return ((await response.json()) as { runnerToken: string }).runnerToken;
}

function hausOrigin() {
    return `http://127.0.0.1:${process.env.HAUS_SERVER_PORT}`;
}

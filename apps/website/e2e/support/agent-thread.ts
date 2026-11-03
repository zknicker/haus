import { assertOpaqueId, createClient, runPsql } from './server.ts';

const agentComputerId = 'cmp_hostedthread0000';
const agentCredentialHash = 'd'.repeat(64);

export async function createAgentThreadSender(input: {
    anchorText: string;
    databaseUrl: string;
    token: string;
}) {
    const owner = createClient(input.token);
    const server = await owner.server.bySlug.query({ slug: 'hosted-messages' });
    const chatId = server.channels.find((channel) => channel.name === 'all')?.id;
    assertOpaqueId(chatId);
    const ownerUserId = runPsql(
        input.databaseUrl,
        "select id from users where id = 'usr_e2e_human'"
    );
    assertOpaqueId(ownerUserId);

    const inventory = {
        runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }],
    };
    runPsql(
        input.databaseUrl,
        `insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
         values ('${agentComputerId}', '${server.id}', '${ownerUserId}', '${agentCredentialHash}', '${JSON.stringify(inventory)}'::jsonb, 'healthy')`
    );
    const created = await owner.agent.create.mutate({
        computerId: agentComputerId,
        displayName: 'Scout',
        handle: 'scout',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: server.id,
    });
    runPsql(
        input.databaseUrl,
        `insert into channel_agent_participants (server_id, chat_id, agent_id)
         values ('${server.id}', '${chatId}', '${created.agent.id}')
         on conflict do nothing`
    );

    const snapshot = await owner.chat.messages.query({ chatId, serverId: server.id });
    const anchor = snapshot.messages.find((message) => message.content === input.anchorText);
    if (!anchor) {
        throw new Error('The hosted Agent Thread test did not resolve its anchor.');
    }
    const target = `#all:${anchor.id.slice(4, 12)}`;
    const runnerToken = await mintAgentRunner(created.agent.id, chatId);

    return {
        send: async (content: string, nonce: string) => {
            const response = await fetch(`${hausOrigin()}/api/agent/messages/send`, {
                body: JSON.stringify({ content, nonce, target }),
                headers: {
                    authorization: `Bearer ${runnerToken}`,
                    'content-type': 'application/json',
                },
                method: 'POST',
            });
            const payload = (await response.json()) as { state?: string };
            if (response.status !== 200 || payload.state !== 'sent') {
                throw new Error(
                    `The hosted Agent Thread test could not author an Agent message: ${response.status} ${JSON.stringify(payload)}`
                );
            }
        },
    };
}

async function mintAgentRunner(agentId: string, chatId: string) {
    const response = await fetch(`${hausOrigin()}/computer/runner/mint`, {
        body: JSON.stringify({
            agentId,
            chatId,
            credentialHash: agentCredentialHash,
            runId: 'run_e2e_agent_thread',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`The hosted Agent Thread test could not mint a runner: ${response.status}`);
    }
    return ((await response.json()) as { runnerToken: string }).runnerToken;
}

function hausOrigin() {
    return `http://127.0.0.1:${process.env.HAUS_SERVER_PORT}`;
}

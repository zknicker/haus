import { createHash } from 'node:crypto';
import { captainsProjectId, createHomedAgent } from './project.ts';
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
        "select id from users where id = 'usr_e2e_human'"
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
    const created = await createHomedAgent(owner, {
        computerId: agentComputerId,
        displayName: 'Orbit',
        handle: 'orbit',
        homeProjectId: chatId,
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: input.serverId,
    });
    const homeProjectId = await captainsProjectId(owner, input.serverId);
    runPsql(
        input.databaseUrl,
        `update projects set default_task_computer_id = '${agentComputerId}'
         where chat_id = '${homeProjectId}'`
    );
    const runnerToken = await mintAgentRunner(created.agent.id, chatId, agentCredentialHash);

    const agentPost = (path: string, body: unknown) =>
        fetch(`${hausOrigin()}${path}`, {
            body: JSON.stringify(body),
            headers: {
                authorization: `Bearer ${runnerToken}`,
                'content-type': 'application/json',
            },
            method: 'POST',
        });

    return {
        agentId: created.agent.id,
        chatId,
        ownerUserId,
        /**
         * Posts as the Agent; `target` defaults to its own Channel. A send held
         * for unseen messages has now shown them, so it is sent once more, as a
         * real Agent would after reading. Answers the sent Message's id.
         */
        send: async (content: string, nonce: string, target = `#${input.channelName}`) => {
            const post = async () => {
                const response = await agentPost('/api/agent/messages/send', {
                    content,
                    nonce,
                    target,
                });
                return {
                    payload: (await response.json()) as {
                        message?: { id: string };
                        state?: string;
                    },
                    response,
                };
            };
            let { payload, response } = await post();
            if (response.status === 200 && payload.state === 'held') {
                ({ payload, response } = await post());
            }
            if (response.status !== 200 || payload.state !== 'sent' || !payload.message) {
                throw new Error(
                    `The mention fixture could not post as its Agent: ${response.status} ${JSON.stringify(payload)}`
                );
            }
            return payload.message.id;
        },
        startTask: async (task: {
            brief?: string;
            from: string;
            target?: string;
            title: string;
        }) => {
            const start = async () => {
                const response = await agentPost('/api/agent/tasks/start', {
                    brief: task.brief ?? task.title,
                    from: task.from,
                    target: task.target ?? `#${input.channelName}`,
                    title: task.title,
                });
                const payload = (await response.json()) as {
                    state?: string;
                    target?: string;
                    task?: { shortId: string };
                };
                return { payload, response };
            };
            let { payload, response } = await start();
            if (response.status === 200 && payload.state === 'held') {
                ({ payload, response } = await start());
            }
            if (response.status !== 200 || !(payload.task && payload.target)) {
                throw new Error(
                    `The Task fixture could not start as its Agent: ${response.status} ${JSON.stringify(payload)}`
                );
            }
            return { shortId: payload.task.shortId, target: payload.target };
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

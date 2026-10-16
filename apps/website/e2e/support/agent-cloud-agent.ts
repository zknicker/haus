import { createHash } from 'node:crypto';
import { assertOpaqueId, attachComputer, createClient, runPsql } from './server.ts';

export interface SeededCloudAgentWork {
    agentId: string;
    chatId: string;
    computerId: string;
    messageId: string;
    runId: string;
    threadChatId: string;
    workId: string;
}

/**
 * Starts one Cloud Agent work the way an Agent does: a Server-minted runner
 * credential calling `POST /api/agent/cloud-agents`, behind a really attached
 * Computer. The browser flow under test is the human side of the work, so both
 * the launch and the Computer's later observations stay real Server calls
 * rather than hand-written rows.
 */
export async function seedCloudAgentWork(input: {
    agentHandle: string;
    channelName: string;
    computerCredential: string;
    content: string;
    databaseUrl: string;
    repository: string;
    serverId: string;
    slug: string;
    startingRef?: null | string;
    title: string;
    token: string;
}): Promise<SeededCloudAgentWork> {
    const owner = createClient(input.token);
    const server = await owner.server.bySlug.query({ slug: input.slug });
    const chatId = server.channels.find((channel) => channel.name === input.channelName)?.id;
    assertOpaqueId(chatId);

    const attached = await attachComputer(owner, {
        credential: input.computerCredential,
        slug: input.slug,
    });
    // A freshly attached Computer has reported nothing yet, and an Agent may
    // only be created on a runtime and model its Computer reports.
    const inventory = {
        runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }],
    };
    runPsql(
        input.databaseUrl,
        `update computers set reported_inventory = '${JSON.stringify(inventory)}'::jsonb, health = 'healthy'
         where id = '${attached.computerId}'`
    );

    const created = await owner.agent.create.mutate({
        computerId: attached.computerId,
        displayName: 'Orbit',
        handle: input.agentHandle,
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

    const receipt = await startCloudAgentWork({
        agentId: created.agent.id,
        chatId,
        computerCredential: input.computerCredential,
        content: input.content,
        repository: input.repository,
        startingRef: input.startingRef ?? null,
        target: `#${input.channelName}`,
        title: input.title,
    });
    const threadChatId = runPsql(
        input.databaseUrl,
        `select id from chats where server_id = '${input.serverId}'
           and anchor_message_id = '${receipt.messageId}'`
    );
    assertOpaqueId(threadChatId);

    return {
        agentId: created.agent.id,
        chatId,
        computerId: attached.computerId,
        messageId: receipt.messageId,
        runId: receipt.runId,
        threadChatId,
        workId: receipt.work.id,
    };
}

/**
 * One more work from an Agent that already exists, against any product target
 * the CLI accepts — including `#channel:<anchorMessageId>`, which is how work
 * comes to run inside somebody else's Thread.
 */
export async function startCloudAgentWork(input: {
    agentId: string;
    /** The launch context Chat the runner credential is minted against. */
    chatId: string;
    computerCredential: string;
    content: string;
    repository: string;
    startingRef?: null | string;
    target: string;
    title: string;
}): Promise<{ messageId: string; runId: string; work: { id: string } }> {
    const runnerToken = await mintAgentRunner({
        agentId: input.agentId,
        chatId: input.chatId,
        credential: input.computerCredential,
    });
    const launch = async () => {
        const response = await fetch(`${hausOrigin()}/api/agent/cloud-agents`, {
            body: JSON.stringify({
                content: input.content,
                nonce: `cloud-agent-${input.agentId}-${input.target}`,
                provider: 'cursor',
                repository: input.repository,
                startingRef: input.startingRef ?? null,
                target: input.target,
                title: input.title,
            }),
            headers: {
                authorization: `Bearer ${runnerToken}`,
                'content-type': 'application/json',
            },
            method: 'POST',
        });
        const receipt = (await response.json()) as {
            messageId?: string;
            runId?: string;
            state?: string;
            work?: { id: string };
        };
        return { receipt, status: response.status };
    };
    // A target with messages the Agent has not read holds the launch and shows
    // them; like an Agent, the fixture has now read them and launches again.
    let { receipt, status } = await launch();
    if (status === 200 && receipt.state === 'held') {
        ({ receipt, status } = await launch());
    }
    if (status !== 200 || !(receipt.work && receipt.messageId && receipt.runId)) {
        throw new Error(
            `The Cloud Agent fixture could not start its work: ${status} ${JSON.stringify(receipt)}`
        );
    }

    return { messageId: receipt.messageId, runId: receipt.runId, work: receipt.work };
}

/** One bounded observation, the frame a Computer sends over its attachment. */
export function cloudAgentObservationFrame(input: {
    /** The work's one bounded line of current state while it runs. */
    activity?: string;
    /** The Run's terminal branch evidence, including any pull request it opened. */
    branches?: import('@haus/api').CloudAgentBranch[];
    observedAt: string;
    runId: string;
    status: 'cancelled' | 'completed' | 'expired' | 'failed' | 'queued' | 'running';
    /** The Run's own report, which the surface reads once the work settles. */
    summary?: string;
    workId: string;
}) {
    return JSON.stringify({
        observation: {
            ...(input.activity
                ? { activity: { at: input.observedAt, summary: input.activity } }
                : {}),
            ...(input.branches ? { branches: input.branches } : {}),
            observedAt: input.observedAt,
            providerUrl: 'https://cursor.com/agents?id=bc_e2e',
            runId: input.runId,
            status: input.status,
            ...(input.summary ? { summary: input.summary } : {}),
            workId: input.workId,
        },
        type: 'cloud-agent-observation',
    });
}

async function mintAgentRunner(input: { agentId: string; chatId: string; credential: string }) {
    const response = await fetch(`${hausOrigin()}/computer/runner/mint`, {
        body: JSON.stringify({
            agentId: input.agentId,
            chatId: input.chatId,
            credentialHash: createHash('sha256').update(input.credential).digest('hex'),
            runId: 'run_e2e_cloud_agent',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`The Cloud Agent fixture could not mint a runner: ${response.status}`);
    }
    return ((await response.json()) as { runnerToken: string }).runnerToken;
}

function hausOrigin() {
    return `http://127.0.0.1:${process.env.HAUS_SERVER_PORT}`;
}

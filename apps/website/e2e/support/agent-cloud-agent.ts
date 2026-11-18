import { createHash } from 'node:crypto';

import { assertOpaqueId, attachComputer, createClient, runPsql } from './server.ts';

export interface SeededCloudAgentWork {
    agentId: string;
    chatId: string;
    computerId: string;
    messageId: string;
    runId: string;
    taskKey: string;
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
    return {
        agentId: created.agent.id,
        chatId,
        computerId: attached.computerId,
        messageId: receipt.messageId,
        runId: receipt.runId,
        taskKey: receipt.taskKey,
        workId: receipt.work.id,
    };
}

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
}): Promise<{ messageId: string; runId: string; taskKey: string; work: { id: string } }> {
    const runnerToken = await mintAgentRunner({
        agentId: input.agentId,
        chatId: input.chatId,
        credential: input.computerCredential,
    });
    const agentPost = (path: string, body: unknown) =>
        fetch(`${hausOrigin()}${path}`, {
            body: JSON.stringify(body),
            headers: {
                authorization: `Bearer ${runnerToken}`,
                'content-type': 'application/json',
            },
            method: 'POST',
        });
    const taskKey = await startLaunchTask(agentPost, input);
    const launch = async () => {
        const response = await agentPost('/api/agent/cloud-agents', {
            content: input.content,
            nonce: `cloud-agent-${input.agentId}-${input.target}`,
            provider: 'cursor',
            repository: input.repository,
            startingRef: input.startingRef ?? null,
            target: input.target,
            task: taskKey,
            title: input.title,
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

    return { messageId: receipt.messageId, runId: receipt.runId, taskKey, work: receipt.work };
}

type AgentPost = (path: string, body: unknown) => Promise<Response>;

async function startLaunchTask(
    agentPost: AgentPost,
    input: { agentId: string; target: string; title: string }
): Promise<string> {
    const send = async () => {
        const response = await agentPost('/api/agent/messages/send', {
            content: `Starting: ${input.title}`,
            nonce: `cloud-agent-origin-${input.agentId}-${input.target}`,
            target: input.target,
        });
        const payload = (await response.json()) as { message?: { id: string }; state?: string };
        return { payload, status: response.status };
    };
    let { payload, status } = await send();
    if (status === 200 && payload.state === 'held') {
        ({ payload, status } = await send());
    }
    if (status !== 200 || payload.state !== 'sent' || !payload.message) {
        throw new Error(
            `The Cloud Agent fixture could not post its origin Message: ${status} ${JSON.stringify(payload)}`
        );
    }
    const response = await agentPost('/api/agent/tasks/start', {
        from: payload.message.id,
        target: input.target,
        title: input.title,
    });
    const started = (await response.json()) as { task?: { key: string } };
    if (response.status !== 200 || !started.task) {
        throw new Error(
            `The Cloud Agent fixture could not start its Task: ${response.status} ${JSON.stringify(started)}`
        );
    }
    return started.task.key;
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

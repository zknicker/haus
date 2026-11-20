import {
    type CreatedAgentSummary,
    type HausAgentMessage,
    type Worker,
    requireCloudWorkerPlace,
} from '@haus/api';

type AgentMessageBodies = Pick<HausAgentMessage, 'agent_created' | 'workers'>;
type MessageWorker = NonNullable<HausAgentMessage['workers']>[number];

/**
 * The typed Message bodies and Worker links in the Agent API's own
 * snake_case wire shape. `workers` carries every link in order (ADR 0044).
 */
export function agentMessageBodies(input: {
    workers: Worker[];
    createdAgent: CreatedAgentSummary | undefined;
}): Partial<AgentMessageBodies> {
    const workers = input.workers.map(workerBody);
    return {
        ...(input.createdAgent ? { agent_created: createdAgentBody(input.createdAgent) } : {}),
        ...(workers.length > 0 ? { workers } : {}),
    };
}

function createdAgentBody(agent: CreatedAgentSummary): AgentMessageBodies['agent_created'] {
    return {
        agent_id: agent.agentId,
        description: agent.description,
        display_name: agent.displayName,
        handle: agent.handle,
        retired: agent.retired,
    };
}

function workerBody(work: Worker): MessageWorker {
    const latest = work.turns[0];
    return {
        activity: work.activity?.summary ?? null,
        id: work.id,
        latest_turn: latest
            ? {
                  branches: latest.branches.map((branch) => ({
                      branch: branch.branch,
                      pull_request_url: branch.pullRequestUrl,
                      repository: branch.repository,
                  })),
                  error_code: latest.errorCode,
                  turn_id: latest.turnId,
                  status: latest.status,
                  summary: latest.summary,
              }
            : null,
        provider: requireCloudWorkerPlace(work.place),
        provider_url: work.providerUrl,
        repository: work.repository,
        starting_ref: work.startingRef,
        status: latest?.status ?? 'queued',
        title: work.title,
    };
}

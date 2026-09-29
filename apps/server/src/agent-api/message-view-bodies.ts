import type { CloudAgentWork, CreatedAgentSummary, HausAgentMessage } from '@haus/api';

type AgentMessageBodies = Pick<HausAgentMessage, 'agent_created' | 'cloud_agent_work'>;

/**
 * The typed Message bodies in the Agent API's own snake_case wire shape.
 */
export function agentMessageBodies(input: {
    cloudAgentWork: CloudAgentWork | undefined;
    createdAgent: CreatedAgentSummary | undefined;
}): Partial<AgentMessageBodies> {
    return {
        ...(input.createdAgent ? { agent_created: createdAgentBody(input.createdAgent) } : {}),
        ...(input.cloudAgentWork
            ? { cloud_agent_work: cloudAgentWorkBody(input.cloudAgentWork) }
            : {}),
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

function cloudAgentWorkBody(work: CloudAgentWork): AgentMessageBodies['cloud_agent_work'] {
    const latest = work.runs[0];
    return {
        activity: work.activity?.summary ?? null,
        id: work.id,
        latest_run: latest
            ? {
                  branches: latest.branches.map((branch) => ({
                      branch: branch.branch,
                      pull_request_url: branch.pullRequestUrl,
                      repository: branch.repository,
                  })),
                  error_code: latest.errorCode,
                  run_id: latest.runId,
                  status: latest.status,
                  summary: latest.summary,
              }
            : null,
        provider: work.provider,
        provider_url: work.providerUrl,
        repository: work.repository,
        starting_ref: work.startingRef,
        status: work.status,
        title: work.title,
    };
}

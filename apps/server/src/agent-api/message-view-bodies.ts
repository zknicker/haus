import type { CloudAgentWork, CreatedAgentSummary, HausAgentMessage } from '@haus/api';

type AgentMessageBodies = Pick<
    HausAgentMessage,
    'agent_created' | 'cloud_agent_work' | 'cloud_agent_works'
>;
type MessageCloudAgentWork = NonNullable<HausAgentMessage['cloud_agent_work']>;

/**
 * The typed Message bodies and Cloud Agent work links in the Agent API's own
 * snake_case wire shape. `cloud_agent_work` repeats the first link for
 * released CLIs; `cloud_agent_works` carries every link in order (ADR 0044).
 */
export function agentMessageBodies(input: {
    cloudAgentWork: CloudAgentWork[];
    createdAgent: CreatedAgentSummary | undefined;
}): Partial<AgentMessageBodies> {
    const works = input.cloudAgentWork.map(cloudAgentWorkBody);
    return {
        ...(input.createdAgent ? { agent_created: createdAgentBody(input.createdAgent) } : {}),
        ...(works[0] ? { cloud_agent_work: works[0], cloud_agent_works: works } : {}),
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

function cloudAgentWorkBody(work: CloudAgentWork): MessageCloudAgentWork {
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

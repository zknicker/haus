import type { CreatedAgentSummary, HausAgentMessage } from '@haus/api';

type AgentMessageBodies = Pick<HausAgentMessage, 'agent_created'>;

/** The typed Message bodies in the Agent API's own snake_case wire shape. */
export function agentMessageBodies(input: {
    createdAgent: CreatedAgentSummary | undefined;
}): Partial<AgentMessageBodies> {
    return input.createdAgent ? { agent_created: createdAgentBody(input.createdAgent) } : {};
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

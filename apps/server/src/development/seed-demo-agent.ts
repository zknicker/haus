import { hausAgentVersion } from '@haus/api';

/** A dev-seed Agent, reported current on the seed Computer. */
export function demoAgent(agent: {
    avatarId: string;
    computerId: string;
    createdByUserId: string;
    description: string;
    displayName: string;
    handle: string;
    id: string;
    modelId: string;
    reportedAt: Date;
    serverId: string;
}) {
    return {
        avatarId: agent.avatarId,
        computerId: agent.computerId,
        createdByUserId: agent.createdByUserId,
        desiredModelId: agent.modelId,
        desiredRuntimeId: 'codex',
        description: agent.description,
        displayName: agent.displayName,
        effectiveHausAgentAppliedAt: agent.reportedAt,
        effectiveHausAgentStatus: 'current' as const,
        effectiveHausAgentVersion: hausAgentVersion,
        effectiveMissing: [],
        effectiveModelId: agent.modelId,
        effectiveReasoningEffort: 'medium' as const,
        effectiveReportedAt: agent.reportedAt,
        effectiveRuntimeId: 'codex',
        handle: agent.handle,
        homeTimezone: 'America/New_York',
        id: agent.id,
        serverId: agent.serverId,
    };
}

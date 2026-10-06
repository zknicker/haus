import { getManualTopic } from '@haus/agent-manual';
import { and, eq } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentManualLookupAuditTable } from '../postgres/schema.ts';

export class AgentCreationGuidanceRequiredError extends Error {
    constructor() {
        super(
            'Read the full Agent creation guidance and a relevant archetype, then supply a standing brief.'
        );
        this.name = 'AgentCreationGuidanceRequiredError';
    }
}

export class AgentStandingBriefRequiredError extends Error {
    constructor() {
        super(
            'Provide a nonempty --brief with the lane, deliverable, evidence and escalation rules before creating an Agent.'
        );
        this.name = 'AgentStandingBriefRequiredError';
    }
}

/** Search results and another Agent's or earlier run's reads cannot authorize a new hire. */
export async function requireAgentCreationGuidance(
    db: Pick<HausDatabase, 'select'>,
    runner: ResolvedRunner,
    brief: string | null
): Promise<void> {
    if (!brief?.trim()) {
        throw new AgentStandingBriefRequiredError();
    }
    const lookups = await db
        .select({ topicId: agentManualLookupAuditTable.resolvedTopicId })
        .from(agentManualLookupAuditTable)
        .where(
            and(
                eq(agentManualLookupAuditTable.serverId, runner.serverId),
                eq(agentManualLookupAuditTable.agentId, runner.agentId),
                eq(agentManualLookupAuditTable.runId, runner.runId),
                eq(agentManualLookupAuditTable.operation, 'get')
            )
        );
    const topics = new Set(lookups.map(({ topicId }) => topicId));
    const hasArchetype = lookups.some(({ topicId }) => {
        const topic = topicId ? getManualTopic(topicId) : null;
        return topic?.kind === 'recipe' && topic.class === 'archetype';
    });
    if (!(topics.has('agent') && topics.has('recipes/decision/one-or-many') && hasArchetype)) {
        throw new AgentCreationGuidanceRequiredError();
    }
}

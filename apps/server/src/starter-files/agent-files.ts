import { renderStarterMemory, starterAgentRules, starterWorkerRules } from '@haus/agent-workspace';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import { type DriveSeedOutcome, seedDriveFile } from '../drive/seed-file.ts';
import type { AgentRef } from '../managed-skills/record.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';

type AgentStarterFileName = 'AGENTS.md' | 'MEMORY.md' | 'WORKER.md';

const agentStarterFileNames: readonly AgentStarterFileName[] = [
    'AGENTS.md',
    'WORKER.md',
    'MEMORY.md',
];

export async function seedAgentStarterFiles(
    db: HausDatabase,
    storage: ArtifactStorage,
    agent: AgentRef
) {
    const outcomes: Partial<Record<AgentStarterFileName, DriveSeedOutcome>> = {};
    const facts = await readStarterFacts(db, agent);
    if (!facts) {
        return outcomes;
    }
    for (const name of agentStarterFileNames) {
        outcomes[name] = await seedDriveFile(db, storage, {
            creator: { agentId: agent.agentId, userId: null },
            path: `agents/${facts.handle}/${name}`,
            serverId: agent.serverId,
            text: starterText(name, facts),
        });
    }
    return outcomes;
}

type StarterFacts = NonNullable<Awaited<ReturnType<typeof readStarterFacts>>>;

function starterText(name: AgentStarterFileName, facts: StarterFacts) {
    if (name === 'AGENTS.md') {
        return starterAgentRules(facts.displayName);
    }
    if (name === 'WORKER.md') {
        return starterWorkerRules(facts.displayName);
    }
    return renderStarterMemory({
        agentName: facts.displayName,
        bio: facts.description,
        brief: facts.brief,
        briefAuthorHandle: facts.briefAuthorHandle,
    });
}

async function readStarterFacts(db: HausDatabase, agent: AgentRef) {
    const creator = alias(agentsTable, 'creator_agent');
    const [row] = await db
        .select({
            brief: agentsTable.brief,
            briefAuthorHandle: creator.handle,
            description: agentsTable.description,
            displayName: agentsTable.displayName,
            handle: agentsTable.handle,
        })
        .from(agentsTable)
        .leftJoin(
            creator,
            and(
                eq(creator.serverId, agentsTable.serverId),
                eq(creator.id, agentsTable.createdByAgentId)
            )
        )
        .where(and(eq(agentsTable.serverId, agent.serverId), eq(agentsTable.id, agent.agentId)))
        .limit(1);
    return row;
}

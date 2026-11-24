import { and, eq, isNull } from 'drizzle-orm';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import { type SweepTimers, startBootSweep } from '../boot-sweep.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentManagedSkillsTable, agentsTable, serversTable } from '../postgres/schema.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { seedAgentStarterFiles } from '../starter-files/agent-files.ts';
import { seedServerRules } from '../starter-files/server-rules.ts';
import type { AgentRef } from './record.ts';
import { factoryRelease, type ManagedSkillRelease } from './release.ts';
import { seedManagedSkills } from './seed.ts';

const sweepIntervalMs = 60 * 60_000;

export interface ManagedSkillSeeder {
    seedAgent(agent: AgentRef, work: Pick<ServerPostCommitWork, 'run'>): Promise<void>;
    seedServer(
        server: { serverId: string; userId: string },
        work: Pick<ServerPostCommitWork, 'run'>
    ): Promise<void>;
    readonly storage: ArtifactStorage | null;
}

export function managedSkillSeeder(db: HausDatabase, storage: ArtifactStorage | null) {
    const seeder: ManagedSkillSeeder = {
        seedAgent: async (agent, work) => {
            if (!storage) {
                return;
            }
            await work.run('agent.seed-managed-skills', () =>
                seedManagedSkills(db, storage, agent)
            );
            await work.run('agent.seed-starter-files', () =>
                seedAgentStarterFiles(db, storage, agent)
            );
        },
        seedServer: (server, work) =>
            storage
                ? work.run('server.seed-rules', () => seedServerRules(db, storage, server))
                : Promise.resolve(),
        storage,
    };
    return seeder;
}

export function startManagedSkillSweep(
    db: HausDatabase,
    storage: ArtifactStorage,
    timers?: SweepTimers
) {
    return startBootSweep({
        intervalMs: sweepIntervalMs,
        name: 'managed-skill seeding',
        run: (closing) => seedStaleManagedSkills(db, storage, closing),
        timers,
    });
}

export async function seedStaleManagedSkills(
    db: HausDatabase,
    storage: ArtifactStorage,
    closing: AbortSignal,
    release: ManagedSkillRelease = factoryRelease
) {
    const agents = await db
        .select({ agentId: agentsTable.id, serverId: agentsTable.serverId })
        .from(agentsTable)
        .innerJoin(serversTable, eq(serversTable.id, agentsTable.serverId))
        .where(and(isNull(agentsTable.retiredAt), isNull(serversTable.deletedAt)));
    const records = await db
        .select({
            agentId: agentManagedSkillsTable.agentId,
            release: agentManagedSkillsTable.releaseFingerprint,
            skillId: agentManagedSkillsTable.skillId,
        })
        .from(agentManagedSkillsTable);
    const applied = new Set(records.map(recordKey));
    const failures: unknown[] = [];
    for (const agent of agents) {
        if (closing.aborted) {
            break;
        }
        const current = release.every((skill) =>
            applied.has(
                recordKey({ agentId: agent.agentId, release: skill.fingerprint, skillId: skill.id })
            )
        );
        if (!current) {
            await seedManagedSkills(db, storage, agent, release).catch((cause: unknown) =>
                failures.push(cause)
            );
        }
    }
    if (failures.length > 0) {
        throw new AggregateError(failures, 'Managed skill seeding failed for some Agents.');
    }
}

function recordKey(record: { agentId: string; release: string; skillId: string }) {
    return `${record.agentId}\0${record.skillId}\0${record.release}`;
}

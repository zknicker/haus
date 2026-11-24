import { artifactPathKey } from '@haus/api';
import { and, asc, eq, isNull, like, or } from 'drizzle-orm';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import { type SweepTimers, startBootSweep } from '../boot-sweep.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    artifactsTable as artifacts,
    serverMembershipsTable,
    serversTable,
} from '../postgres/schema.ts';
import { type AgentStarterFileName, seedAgentStarterFiles } from './agent-files.ts';
import { backfillProjectRules } from './backfill-projects.ts';
import { hausRulesPath, seedServerRules } from './server-rules.ts';

const sweepIntervalMs = 60 * 60_000;
const ruleFileNames: readonly AgentStarterFileName[] = ['AGENTS.md', 'WORKER.md'];

export function startRuleFileBackfill(
    db: HausDatabase,
    storage: ArtifactStorage,
    timers?: SweepTimers
) {
    return startBootSweep({
        intervalMs: sweepIntervalMs,
        name: 'rule-file backfill',
        run: (closing) => backfillRuleFiles(db, storage, closing),
        timers,
    });
}

export async function backfillRuleFiles(
    db: HausDatabase,
    storage: ArtifactStorage,
    closing: AbortSignal
) {
    const held = await heldRuleKeys(db);
    const failures: unknown[] = [];
    const settle = (work: Promise<unknown>) =>
        work.catch((cause: unknown) => {
            failures.push(cause);
        });
    for (const server of await liveServerOwners(db)) {
        if (closing.aborted) {
            return;
        }
        if (!held.has(heldKey(server.serverId, hausRulesPath))) {
            await settle(seedServerRules(db, storage, server, 'ever-held'));
        }
    }
    for (const agent of await liveAgents(db)) {
        if (closing.aborted) {
            return;
        }
        const names = ruleFileNames.filter(
            (name) => !held.has(heldKey(agent.serverId, `agents/${agent.handle}/${name}`))
        );
        if (names.length > 0) {
            await settle(seedAgentStarterFiles(db, storage, agent, { names, unless: 'ever-held' }));
        }
    }
    await settle(backfillProjectRules(db, storage, closing));
    if (failures.length > 0) {
        throw new AggregateError(failures, 'Rule-file backfill failed for some files.');
    }
}

async function heldRuleKeys(db: HausDatabase) {
    const rows = await db
        .select({ pathKey: artifacts.pathKey, serverId: artifacts.serverId })
        .from(artifacts)
        .where(
            or(
                eq(artifacts.pathKey, artifactPathKey(hausRulesPath)),
                ...ruleFileNames.map((name) =>
                    like(artifacts.pathKey, `agents/%/${artifactPathKey(name)}`)
                )
            )
        );
    return new Set(rows.map((row) => `${row.serverId}\0${row.pathKey}`));
}

function heldKey(serverId: string, path: string) {
    return `${serverId}\0${artifactPathKey(path)}`;
}

async function liveServerOwners(db: HausDatabase) {
    const rows = await db
        .select({
            serverId: serverMembershipsTable.serverId,
            userId: serverMembershipsTable.userId,
        })
        .from(serverMembershipsTable)
        .innerJoin(serversTable, eq(serversTable.id, serverMembershipsTable.serverId))
        .where(
            and(
                isNull(serversTable.deletedAt),
                eq(serverMembershipsTable.role, 'owner'),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .orderBy(asc(serverMembershipsTable.createdAt));
    const owners = new Map<string, { serverId: string; userId: string }>();
    for (const row of rows) {
        if (!owners.has(row.serverId)) {
            owners.set(row.serverId, row);
        }
    }
    return [...owners.values()];
}

async function liveAgents(db: HausDatabase) {
    return await db
        .select({
            agentId: agentsTable.id,
            handle: agentsTable.handle,
            serverId: agentsTable.serverId,
        })
        .from(agentsTable)
        .innerJoin(serversTable, eq(serversTable.id, agentsTable.serverId))
        .where(and(isNull(agentsTable.retiredAt), isNull(serversTable.deletedAt)));
}

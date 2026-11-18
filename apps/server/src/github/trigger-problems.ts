import type { GithubTriggerProblem } from '@haus/api';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { githubTriggerConfigsTable, triggersTable } from '../postgres/schema.ts';
import { enqueueTriggerProblemNotice } from './problem-notice.ts';

export interface GithubTriggerProblemMark {
    now: Date;
    problem: GithubTriggerProblem;
    /** Every armed, undeleted `github` Trigger on an installation, or the named Triggers. */
    scope: { installationRowId: string } | { triggerIds: readonly string[] };
    serverId: string;
}

/** One Trigger that entered the problem, for the caller's after-commit notice dispatch. */
export interface GithubTriggerProblemEntered {
    ownerAgentId: string;
    problem: GithubTriggerProblem;
    problemSince: Date;
    triggerId: string;
}

/**
 * Puts Triggers into `problem` inside the caller's transaction: sets
 * `problem` and `problem_since`, bumps `version`, and enqueues one
 * `trigger_problem` notice per Trigger that newly entered it
 * (specs/github-triggers.md#failure-modes). A Trigger already in that problem
 * is left alone. Notices dispatch after the caller commits.
 */
export async function markGithubTriggersProblem(
    tx: HausDatabase,
    mark: GithubTriggerProblemMark
): Promise<{ entered: GithubTriggerProblemEntered[] }> {
    if ('triggerIds' in mark.scope && mark.scope.triggerIds.length === 0) {
        return { entered: [] };
    }
    const candidates = await tx
        .select({
            anchorChatId: triggersTable.anchorChatId,
            id: triggersTable.id,
            ownerAgentId: triggersTable.ownerAgentId,
            problem: githubTriggerConfigsTable.problem,
            title: triggersTable.title,
        })
        .from(githubTriggerConfigsTable)
        .innerJoin(
            triggersTable,
            and(
                eq(triggersTable.serverId, githubTriggerConfigsTable.serverId),
                eq(triggersTable.id, githubTriggerConfigsTable.triggerId)
            )
        )
        .where(
            and(
                eq(githubTriggerConfigsTable.serverId, mark.serverId),
                'installationRowId' in mark.scope
                    ? eq(githubTriggerConfigsTable.installationRowId, mark.scope.installationRowId)
                    : inArray(githubTriggerConfigsTable.triggerId, [...mark.scope.triggerIds]),
                eq(triggersTable.kind, 'github'),
                eq(triggersTable.status, 'armed'),
                isNull(triggersTable.deletedAt)
            )
        )
        .for('update');
    const entering = candidates.filter((candidate) => candidate.problem !== mark.problem);
    if (entering.length === 0) {
        return { entered: [] };
    }
    const ids = entering.map((candidate) => candidate.id);
    await tx
        .update(githubTriggerConfigsTable)
        .set({ problem: mark.problem, problemSince: mark.now })
        .where(
            and(
                eq(githubTriggerConfigsTable.serverId, mark.serverId),
                inArray(githubTriggerConfigsTable.triggerId, ids)
            )
        );
    await bumpVersions(tx, mark.serverId, ids, mark.now);
    for (const candidate of entering) {
        await enqueueTriggerProblemNotice(tx, {
            anchorChatId: candidate.anchorChatId,
            ownerAgentId: candidate.ownerAgentId,
            problem: mark.problem,
            problemSince: mark.now,
            serverId: mark.serverId,
            title: candidate.title,
            triggerId: candidate.id,
        });
    }
    return {
        entered: entering.map((candidate) => ({
            ownerAgentId: candidate.ownerAgentId,
            problem: mark.problem,
            problemSince: mark.now,
            triggerId: candidate.id,
        })),
    };
}

/** Clears the named Triggers' problems once the cause is gone. Clearing notifies nobody. */
export async function clearGithubTriggersProblem(
    tx: HausDatabase,
    input: { now: Date; serverId: string; triggerIds: readonly string[] }
): Promise<string[]> {
    if (input.triggerIds.length === 0) {
        return [];
    }
    const cleared = await tx
        .update(githubTriggerConfigsTable)
        .set({ problem: null, problemSince: null })
        .where(
            and(
                eq(githubTriggerConfigsTable.serverId, input.serverId),
                inArray(githubTriggerConfigsTable.triggerId, [...input.triggerIds]),
                isNotNull(githubTriggerConfigsTable.problem)
            )
        )
        .returning({ id: githubTriggerConfigsTable.triggerId });
    const ids = cleared.map((row) => row.id);
    await bumpVersions(tx, input.serverId, ids, input.now);
    return ids;
}

/** One agent wake per owner with new notices, for `postCommitWork.wakeAgents`. */
export function problemWakes(
    serverId: string,
    entered: readonly GithubTriggerProblemEntered[]
): { agentId: string; serverId: string }[] {
    return [...new Set(entered.map((entry) => entry.ownerAgentId))].map((agentId) => ({
        agentId,
        serverId,
    }));
}

async function bumpVersions(tx: HausDatabase, serverId: string, ids: string[], now: Date) {
    if (ids.length === 0) {
        return;
    }
    await tx
        .update(triggersTable)
        .set({ updatedAt: now, version: sql`${triggersTable.version} + 1` })
        .where(and(eq(triggersTable.serverId, serverId), inArray(triggersTable.id, ids)));
}

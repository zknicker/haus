import { dreamDedupeKey } from '../agent-delivery/heartbeat-keys.ts';
import { localDateOf, stableId } from './seed-heartbeats-clock.ts';
import { type DreamPlan, dreamPatch, dreamSummary } from './seed-heartbeats-plan.ts';
import {
    agentOf,
    checkRow,
    runIdOf,
    type Scope,
    shopChatId,
    turnRow,
} from './seed-heartbeats-rows.ts';

const minute = 60_000;

/**
 * A settled dream: its run and turn, the memory change the Computer reported, the
 * summary the Agent filed (only when it learned something), and the follow-up
 * Reminder it created inside the run's window.
 */
export function addDream(scope: Scope, plan: DreamPlan) {
    const { context, records } = scope;
    const agentId = agentOf(scope.agents, plan.who);
    const startedAt = scope.clock(plan.day, plan.time);
    const endedAt = new Date(startedAt.getTime() + (plan.who === 'cove' ? 3 : 5) * minute);
    const localDate = localDateOf(startedAt);
    const dreamRunId = runIdOf(agentId, plan.key);
    const { files, patch } = dreamPatch(plan);
    records.triggers.push({
        agentId,
        createdAt: startedAt,
        runId: dreamRunId,
        serverId: context.serverId,
        source: 'dream',
        workId: dreamDedupeKey(agentId, localDate),
    });
    records.turns.push(
        turnRow(scope, {
            agentId,
            endedAt,
            produced: true,
            runId: dreamRunId,
            startedAt,
            summary: 'Reviewed the day’s conversations and tidied memory.',
            tokens: plan.tokens,
            who: plan.who,
        })
    );
    records.dreams.push({
        agentId,
        createdAt: endedAt,
        files,
        finishedAt: endedAt,
        patch,
        runId: dreamRunId,
        serverId: context.serverId,
        startedAt,
        truncated: false,
    });
    records.checks.push(
        checkRow(context.serverId, {
            agentId,
            at: startedAt,
            key: `${plan.key}:queued`,
            kind: 'nightly',
            localDate,
            outcome: 'queued',
            slot: plan.time,
        })
    );
    const summary = dreamSummary(plan);
    if (summary) {
        records.summaries.push({
            agentId,
            createdAt: endedAt,
            runId: dreamRunId,
            serverId: context.serverId,
            summary,
            updatedAt: endedAt,
        });
    }
    if (plan.followUp) {
        // Created inside the dream's window, which is how a dream's follow-ups are found.
        const createdAt = new Date(startedAt.getTime() + 2 * minute);
        records.reminders.push({
            anchorChatId: shopChatId,
            anchorMessageId: records.ownerMessage.id,
            createdAt,
            description: plan.followUp.description,
            fireAt: new Date(scope.now.getTime() + 2 * 24 * 60 * minute),
            id: stableId('rem', plan.key),
            ownerAgentId: agentId,
            serverId: context.serverId,
            status: 'scheduled',
            timezone: 'America/New_York',
            title: plan.followUp.title,
            updatedAt: createdAt,
        });
    }
}

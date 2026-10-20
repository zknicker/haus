import type { AgentHeartbeatRequest } from '@haus/api';
import { tracePromise } from '@haus/effect';
import { sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { isConfigured } from './deferred-configuration.ts';
import type { AgentDelivery } from './delivery.ts';
import { readAgentDispatchConfig } from './dispatch-config.ts';
import { dreamDedupeKey, heartbeatDedupeKey } from './heartbeat-keys.ts';
import { isHeartbeatUsagePaused } from './heartbeat-usage-pause.ts';
import { hasQueuedAddressedMessage } from './heartbeat-yield.ts';
import * as store from './store.ts';

type Decision =
    | { outcome: 'queued' }
    | {
          outcome: 'skipped';
          reason: 'busy' | 'no_activity' | 'not_assigned' | 'stopped' | 'usage_paused';
      };

/**
 * Decides one heartbeat slot its Computer announced, and queues the run when it
 * should happen. Both kinds need a configured Agent assigned to that Computer, a
 * running Agent, and a weekly meter under the pause line. A nightly run also needs
 * activity since the last one; a busy Agent still gets it, queued behind its work
 * and retired after four hours. A daytime run is skipped, never queued, while the
 * Agent has an active run or concrete work waiting, and one that cannot start within
 * half an hour is retired. The dedupe keys make a repeat of the same slot a no-op.
 * Every decision is a `haus.heartbeat.request` span. Returns whether a run was queued.
 */
export async function requestAgentHeartbeat(
    db: HausDatabase,
    delivery: AgentDelivery,
    input: { computerId: string; request: AgentHeartbeatRequest; serverId: string }
): Promise<boolean> {
    const { request } = input;
    if (!delivery.runtime) {
        return (await decideAndQueue(db, delivery, input)).outcome === 'queued';
    }
    const decision = await tracePromise(
        delivery.runtime,
        'haus.heartbeat.request',
        {
            'haus.agent.id': request.agentId,
            'haus.heartbeat.kind': request.kind,
            'haus.heartbeat.local_date': request.localDate,
            'haus.heartbeat.slot': request.slot,
            'haus.operation': 'heartbeat.request',
            'haus.server.id': input.serverId,
        },
        async () => decideAndQueue(db, delivery, input),
        undefined,
        (decided) => ({
            'haus.heartbeat.outcome': decided.outcome,
            ...(decided.outcome === 'skipped'
                ? { 'haus.heartbeat.skip_reason': decided.reason }
                : {}),
        })
    );
    return decision.outcome === 'queued';
}

async function decideAndQueue(
    db: HausDatabase,
    delivery: AgentDelivery,
    input: { computerId: string; request: AgentHeartbeatRequest; serverId: string }
): Promise<Decision> {
    const { request } = input;
    const decision = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const decided = await decide(tx, input);
        if (decided.outcome === 'queued') {
            await delivery.enqueue(tx, {
                agentId: request.agentId,
                chatId: null,
                content: '',
                dedupeKey:
                    request.kind === 'nightly'
                        ? dreamDedupeKey(request.agentId, request.localDate)
                        : heartbeatDedupeKey(request.agentId, request.localDate, request.slot),
                serverId: input.serverId,
                source: request.kind === 'nightly' ? 'dream' : 'heartbeat',
            });
        }
        return decided;
    });
    if (decision.outcome === 'queued') {
        await delivery.dispatchAgent(request.agentId, input.serverId);
    }
    return decision;
}

async function decide(
    tx: HausDatabase,
    input: { computerId: string; request: AgentHeartbeatRequest; serverId: string }
): Promise<Decision> {
    const { agentId, kind } = input.request;
    if ((await store.readAgentServerId(tx, agentId)) !== input.serverId) {
        return { outcome: 'skipped', reason: 'not_assigned' };
    }
    const config = await readAgentDispatchConfig(tx, agentId);
    if (!(isConfigured(config) && config.computerId === input.computerId)) {
        return { outcome: 'skipped', reason: 'not_assigned' };
    }
    const state = await store.readDeliveryState(tx, agentId);
    if (state?.stopped) {
        return { outcome: 'skipped', reason: 'stopped' };
    }
    if (
        await isHeartbeatUsagePaused(tx, {
            computerId: input.computerId,
            runtimeId: config.desiredRuntimeId,
        })
    ) {
        return { outcome: 'skipped', reason: 'usage_paused' };
    }
    if (kind === 'nightly') {
        return (await tookPartSinceLastNight(tx, agentId, input.serverId))
            ? { outcome: 'queued' }
            : { outcome: 'skipped', reason: 'no_activity' };
    }
    const busy =
        Boolean(state?.activeRunId) ||
        (await store.listQueuedConcreteItems(tx, agentId, 1)).length > 0 ||
        (await hasQueuedAddressedMessage(tx, agentId));
    return busy ? { outcome: 'skipped', reason: 'busy' } : { outcome: 'queued' };
}

/**
 * Whether the Agent posted, was mentioned or addressed, or sent a heartbeat report
 * since its last nightly run (ever, when it has had none).
 */
async function tookPartSinceLastNight(
    tx: HausDatabase,
    agentId: string,
    serverId: string
): Promise<boolean> {
    const [row] = (await tx.execute(sql`
        with last_night as (
            select coalesce(max(trigger.created_at), 'epoch'::timestamptz) as at
            from agent_run_triggers trigger
            where trigger.server_id = ${serverId}
              and trigger.agent_id = ${agentId}
              and trigger.source = 'dream'
        )
        select (
            exists (
                select 1 from chat_messages message, last_night
                where message.server_id = ${serverId}
                  and message.author_agent_id = ${agentId}
                  and message.created_at > last_night.at
            )
            or exists (
                select 1 from agent_inbox item, last_night
                where item.server_id = ${serverId}
                  and item.agent_id = ${agentId}
                  and item.created_at > last_night.at
                  and (
                      item.source = 'heartbeat_report'
                      or item.mentioned
                      or item.addressed_reason is not null
                  )
            )
        ) as "active"
    `)) as { active: boolean }[];
    return row?.active === true;
}

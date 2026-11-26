import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import { publishCommittedAgentActivity } from './activity-events.ts';
import { sendDeferredConfiguration } from './deferred-configuration.ts';
import type { DeliveryTransport } from './delivery.ts';
import { interruptActiveRun } from './interrupt-active-run.ts';
import { publishAgentLifecycle } from './lifecycle.ts';
import type { AgentLoopRoute } from './loop-host.ts';

export async function killActiveRun(
    deps: { db: HausDatabase; route: AgentLoopRoute; transport: DeliveryTransport },
    input: { agentId: string; serverId: string },
    options: { stop?: boolean } = {}
) {
    const kill = await interruptActiveRun(deps.db, input, options);
    if (!kill) {
        return;
    }
    publishRealtime(kill.claimEvents);
    if (kill.activity) {
        publishCommittedAgentActivity(kill.activity);
    }
    publishAgentLifecycle({
        agentId: input.agentId,
        chatId: kill.chatId,
        outcome: 'stopped',
        phase: 'settled',
        runId: kill.runId,
        serverId: input.serverId,
    });
    deps.route.send(deps.route.hostOf(kill.computerId), {
        agentId: input.agentId,
        runId: kill.runId,
        type: 'stop',
    });
    if (kill.configuration) {
        sendDeferredConfiguration(deps.transport, input.agentId, kill.configuration);
    }
}

import { type EffectRuntime, type TraceCarrier, tracePromise } from '@haus/effect';
import type { LoopFrame } from './loop-host.ts';

interface TraceableDispatchPlan {
    frame: LoopFrame;
}

export async function traceAgentDispatch<Plan extends TraceableDispatchPlan>(
    runtime: EffectRuntime<never> | undefined,
    input: { agentId: string; serverId: string },
    plan: () => Promise<Plan | null>
): Promise<Plan | null> {
    if (!runtime) {
        return await plan();
    }
    return await tracePromise(
        runtime,
        'haus.agent.dispatch',
        {
            'haus.agent.id': input.agentId,
            'haus.operation': 'agent.dispatch',
            'haus.server.id': input.serverId,
        },
        async (carrier) => attachTraceCarrier(await plan(), carrier)
    );
}

function attachTraceCarrier<Plan extends TraceableDispatchPlan>(
    plan: Plan | null,
    traceContext: TraceCarrier
): Plan | null {
    if (plan?.frame.type === 'start') {
        return { ...plan, frame: { ...plan.frame, traceContext } };
    }
    if (plan?.frame.type === 'runner-start') {
        return {
            ...plan,
            frame: { ...plan.frame, start: { ...plan.frame.start, traceContext } },
        };
    }
    return plan;
}

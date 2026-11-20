import {
    type InvocationRequestFrame,
    type InvocationResultFrame,
    invocationOutcomeNotices,
} from '@haus/api';

export function routeAgentInvocation(request: InvocationRequestFrame) {
    const result: InvocationResultFrame = {
        agentId: request.agentId,
        outcome: 'offline',
        output: { kind: 'text', text: invocationOutcomeNotices.offline },
        runId: request.runId,
        seq: request.seq,
        toolCallId: request.toolCallId,
        truncated: false,
        type: 'invocation-result',
    };
    return result;
}

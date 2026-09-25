import {
    decodeRoutingDecision,
    type MessageRouter,
    routingModel,
    routingQuestions,
} from './jev.ts';
import { decodeMentionScopeDecision, mentionScopeRequest } from './mention-scope.ts';

/** The TypeSafe client behind both routing questions: one deadline, no retries, fail closed. */
export function createJevRouter(
    apiKey: string,
    request: (url: string, init: RequestInit) => Promise<Response> = fetch
): MessageRouter {
    async function ask<T>(
        body: unknown,
        decode: (value: unknown) => T
    ): Promise<T | { kind: 'broadcast'; reason: 'failure' | 'timeout' }> {
        const signal = AbortSignal.timeout(1500);
        try {
            const response = await request('https://api.typesafe.ai/v1/systemone', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal,
            });
            if (!response.ok) {
                return { kind: 'broadcast', reason: 'failure' };
            }
            return decode(await response.json());
        } catch {
            return { kind: 'broadcast', reason: signal.aborted ? 'timeout' : 'failure' };
        }
    }
    return {
        judge: (state) =>
            ask({ model: routingModel, state, questions: routingQuestions(state) }, (value) =>
                decodeRoutingDecision(value, state.eligibleAgentIds)
            ),
        judgeMentionScope: (state) => ask(mentionScopeRequest(state), decodeMentionScopeDecision),
    };
}

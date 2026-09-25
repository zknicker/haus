import { expect, test } from 'bun:test';
import { type RoutingState, routingModel } from './jev.ts';
import { createJevRouter } from './jev-client.ts';
import { decodeMentionScopeDecision, mentionScopePromptVersion } from './mention-scope.ts';

function answer(
    choice = 'mentioned',
    confidence = 0.95,
    probabilities: Record<string, number> = { mentioned: 0.97, others: 0.02, unclear: 0.01 }
) {
    return {
        model: routingModel,
        answers: { scope: { type: 'choice', choice, confidence, probabilities } },
    };
}
const state: RoutingState = {
    channel: { id: 'channel', name: null, participants: [] },
    eligibleAgentIds: ['a', 'b'],
    history: [],
    currentMessage: {
        authorId: 'human',
        text: '@a please check the build.',
        explicitAgentIds: ['a'],
        replyRecipientAgentIds: [],
    },
};

test('only a mentioned-only answer above both routing thresholds narrows', () => {
    expect(decodeMentionScopeDecision(answer())).toEqual({
        kind: 'mentioned',
        confidence: 0.95,
        probability: 0.97,
    });
    for (const [response, choice] of [
        [answer('mentioned', 0.89), 'mentioned'],
        [answer('mentioned', 0.95, { mentioned: 0.89, others: 0.1, unclear: 0.01 }), 'mentioned'],
        [answer('others', 1, { mentioned: 0, others: 1, unclear: 0 }), 'others'],
        [answer('unclear', 1, { mentioned: 0, others: 0, unclear: 1 }), 'unclear'],
    ] as const) {
        expect(decodeMentionScopeDecision(response)).toMatchObject({
            kind: 'broadcast',
            reason: 'uncertain',
            choice,
        });
    }
});

test('malformed mention-scope answers fall back as invalid', () => {
    for (const response of [
        null,
        { ...answer(), model: 'other' },
        answer('a'),
        answer('mentioned', Number.NaN),
        answer('mentioned', 1, { mentioned: 1, others: 1, unclear: 0 }),
        answer('others', 1, { mentioned: 1, others: 0, unclear: 0 }),
        answer('mentioned', 1, { mentioned: 1, others: 0 }),
        { model: routingModel, answers: { audience: answer().answers.scope } },
    ]) {
        expect(decodeMentionScopeDecision(response)).toEqual({
            kind: 'broadcast',
            reason: 'invalid',
        });
    }
});

test('the mention-scope request asks one pinned question and fails closed', async () => {
    let body: { model?: string; questions?: Record<string, unknown>; state?: RoutingState } = {};
    const router = createJevRouter('private-key', async (_url, init) => {
        body = JSON.parse(String(init.body));
        return Response.json(answer());
    });
    expect((await router.judgeMentionScope(state)).kind).toBe('mentioned');
    expect(body.model).toBe(routingModel);
    expect(Object.keys(body.questions ?? {})).toEqual(['scope']);
    expect(body.state?.currentMessage.explicitAgentIds).toEqual(['a']);
    expect(mentionScopePromptVersion).toBe('mention-v2');
    const failing = createJevRouter(
        'private-key',
        async () => new Response('private vendor error', { status: 529 })
    );
    expect(await failing.judgeMentionScope(state)).toEqual({
        kind: 'broadcast',
        reason: 'failure',
    });
});

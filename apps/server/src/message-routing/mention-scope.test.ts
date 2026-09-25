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

test('a mentioned-only answer narrows on confidence alone at 0.80', () => {
    expect(decodeMentionScopeDecision(answer())).toEqual({
        kind: 'mentioned',
        confidence: 0.95,
        probability: 0.97,
    });
    expect(decodeMentionScopeDecision(answer('mentioned', 0.8))).toMatchObject({
        kind: 'mentioned',
        confidence: 0.8,
    });
    // Probability is recorded for diagnostics; it no longer gates.
    expect(
        decodeMentionScopeDecision(
            answer('mentioned', 0.9, { mentioned: 0.6, others: 0.3, unclear: 0.1 })
        )
    ).toEqual({ kind: 'mentioned', confidence: 0.9, probability: 0.6 });
    expect(decodeMentionScopeDecision(answer('mentioned', 0.79))).toMatchObject({
        kind: 'broadcast',
        reason: 'uncertain',
        choice: 'mentioned',
    });
});

test('confident others or unclear answers are kept; below-threshold ones are uncertain', () => {
    for (const [response, reason, choice] of [
        [answer('others', 0.99, { mentioned: 0, others: 1, unclear: 0 }), 'kept', 'others'],
        [answer('unclear', 0.8, { mentioned: 0, others: 0, unclear: 1 }), 'kept', 'unclear'],
        [
            answer('others', 0.79, { mentioned: 0.2, others: 0.8, unclear: 0 }),
            'uncertain',
            'others',
        ],
    ] as const) {
        expect(decodeMentionScopeDecision(response)).toMatchObject({
            kind: 'broadcast',
            reason,
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

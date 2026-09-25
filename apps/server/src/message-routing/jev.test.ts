import { expect, test } from 'bun:test';
import {
    decodeRoutingDecision,
    type RoutingState,
    routingModel,
    routingQuestions,
    routingThreshold,
} from './jev.ts';
import { createJevRouter } from './jev-client.ts';

function answer(
    choice = 'a',
    confidence = 0.95,
    probabilities: Record<string, number> = {
        a: 0.96,
        b: 0.01,
        multiple: 0.01,
        human: 0.01,
        unclear: 0.01,
    }
) {
    return {
        model: routingModel,
        answers: { audience: { type: 'choice', choice, confidence, probabilities } },
    };
}
test('an eligible winner narrows at the 0.80 confidence threshold', () => {
    expect(routingThreshold).toBe(0.8);
    expect(decodeRoutingDecision(answer('a', 0.8), ['a', 'b'])).toEqual({
        kind: 'narrow',
        agentId: 'a',
        confidence: 0.8,
        probability: 0.96,
    });
    expect(decodeRoutingDecision(answer('a', 0.79), ['a', 'b'])).toMatchObject({
        kind: 'broadcast',
        reason: 'uncertain',
        choice: 'a',
        confidence: 0.79,
    });
});
test('the selected probability is recorded but does not gate narrowing', () => {
    expect(
        decodeRoutingDecision(
            answer('a', 0.95, { a: 0.6, b: 0.37, multiple: 0.01, human: 0.01, unclear: 0.01 }),
            ['a', 'b']
        )
    ).toEqual({ kind: 'narrow', agentId: 'a', confidence: 0.95, probability: 0.6 });
});
test('a confident non-narrowing answer is kept, not uncertain', () => {
    for (const choice of ['multiple', 'human', 'unclear']) {
        const probabilities = { a: 0, b: 0, multiple: 0, human: 0, unclear: 0, [choice]: 1 };
        expect(decodeRoutingDecision(answer(choice, 0.99, probabilities), ['a', 'b'])).toEqual({
            kind: 'broadcast',
            reason: 'kept',
            choice,
            confidence: 0.99,
            probability: 1,
        });
        expect(
            decodeRoutingDecision(answer(choice, 0.79, probabilities), ['a', 'b'])
        ).toMatchObject({ kind: 'broadcast', reason: 'uncertain', choice });
    }
});
test('invalid model, options, probabilities and inconsistent winners fall back', () => {
    for (const response of [
        null,
        { ...answer(), model: 'other' },
        answer('outsider'),
        answer('a', Number.NaN),
        answer('a', 1, { a: 1, b: 1, multiple: 0, human: 0, unclear: 0 }),
        answer('b'),
        answer('a', 1, { a: 1, b: 0, multiple: 0, human: 0, unclear: 0, extra: 0 }),
    ]) {
        expect(decodeRoutingDecision(response, ['a', 'b'])).toEqual({
            kind: 'broadcast',
            reason: 'invalid',
        });
    }
});

const state: RoutingState = {
    channel: { id: 'channel', name: 'product', participants: [] },
    eligibleAgentIds: ['a', 'b'],
    history: [],
    currentMessage: {
        authorId: 'human',
        text: 'Please do that too.',
        explicitAgentIds: [],
        replyRecipientAgentIds: [],
    },
};
test('provider errors and malformed bodies fall back without leaking response details', async () => {
    for (const response of [
        new Response('private vendor error', { status: 529 }),
        new Response('not json'),
        Response.json({}),
    ]) {
        const router = createJevRouter('private-key', async () => response);
        expect((await router.judge(state)).kind).toBe('broadcast');
    }
});
test('an unresponsive provider is aborted within the send deadline', async () => {
    let aborted = false;
    const router = createJevRouter(
        'private-key',
        (_url, init) =>
            new Promise((_resolve, reject) => {
                init.signal?.addEventListener(
                    'abort',
                    () => {
                        aborted = true;
                        reject(new Error('private provider failure'));
                    },
                    { once: true }
                );
            })
    );
    const start = performance.now();
    expect(await router.judge(state)).toEqual({ kind: 'broadcast', reason: 'timeout' });
    expect(aborted).toBe(true);
    expect(performance.now() - start).toBeLessThan(2500);
});

test('the routing request asks only the audience question', () => {
    expect(Object.keys(routingQuestions(state))).toEqual(['audience']);
});

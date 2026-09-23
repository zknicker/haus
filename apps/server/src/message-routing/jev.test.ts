import { expect, test } from 'bun:test';
import {
    createJevRouter,
    decodeRoutingDecision,
    expectsReplyQuestion,
    type RoutingState,
    routingModel,
    routingQuestions,
} from './jev.ts';

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
test('only an eligible winner above both evaluated thresholds can narrow', () => {
    expect(decodeRoutingDecision(answer(), ['a', 'b'])).toEqual({
        kind: 'narrow',
        agentId: 'a',
        confidence: 0.95,
        probability: 0.96,
    });
    expect(decodeRoutingDecision(answer('a', 0.89), ['a', 'b'])).toMatchObject({
        kind: 'broadcast',
        reason: 'uncertain',
    });
    expect(
        decodeRoutingDecision(
            answer('a', 0.95, { a: 0.89, b: 0.08, multiple: 0.01, human: 0.01, unclear: 0.01 }),
            ['a', 'b']
        )
    ).toMatchObject({ kind: 'broadcast', reason: 'uncertain' });
    expect(
        decodeRoutingDecision(
            answer('multiple', 1, { a: 0, b: 0, multiple: 1, human: 0, unclear: 0 }),
            ['a', 'b']
        )
    ).toMatchObject({ kind: 'broadcast', reason: 'uncertain' });
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

test('the reply judgment rides the routing request and never changes the audience outcome', () => {
    const questions = routingQuestions(state);
    expect(questions.expects_reply).toMatchObject({ type: 'noul' });
    expect(questions.expects_reply.instructions[0]).toBe(expectsReplyQuestion);
    const withReply = (noul: unknown) => ({
        ...answer(),
        answers: { ...answer().answers, expects_reply: { type: 'noul', noul } },
    });
    expect(decodeRoutingDecision(withReply(0.12), ['a', 'b'])).toEqual({
        kind: 'narrow',
        agentId: 'a',
        confidence: 0.95,
        probability: 0.96,
        expectsReply: 0.12,
    });
    // A malformed or missing reply judgment is simply absent.
    for (const response of [withReply(1.4), withReply('yes'), answer()]) {
        expect(decodeRoutingDecision(response, ['a', 'b'])).toEqual({
            kind: 'narrow',
            agentId: 'a',
            confidence: 0.95,
            probability: 0.96,
        });
    }
    // An invalid audience keeps its fallback while the reply judgment survives.
    expect(
        decodeRoutingDecision(
            { ...withReply(0.05), answers: { expects_reply: { type: 'noul', noul: 0.05 } } },
            ['a', 'b']
        )
    ).toEqual({ kind: 'broadcast', reason: 'invalid', expectsReply: 0.05 });
});

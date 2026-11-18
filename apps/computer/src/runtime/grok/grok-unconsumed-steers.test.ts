import { expect, test } from 'bun:test';
import { drain, fakeGrok, update } from './fixtures/fake-grok.ts';

/** A running turn whose prompt the test finishes, with Grok queueing every interjection. */
async function runningTurn() {
    let finishPrompt: (value: unknown) => void = () => undefined;
    const grok = fakeGrok((method) =>
        method === '_x.ai/interject'
            ? { result: { status: 'queued' } }
            : new Promise((resolve) => {
                  finishPrompt = resolve;
              })
    );
    const turn = await grok.session.startTurn({
        prompt: 'start',
        signal: new AbortController().signal,
    });
    grok.send(update('agent_message_chunk', { content: { text: 'working', type: 'text' } }));
    return { finishPrompt: (value: unknown) => finishPrompt(value), grok, turn };
}

test('an interjection Grok still holds queued when the turn ends is returned', async () => {
    const { finishPrompt, grok, turn } = await runningTurn();
    expect(await grok.session.steer('inbox notice')).toEqual({ delivered: true });
    finishPrompt({ stopReason: 'end_turn' });
    await drain(turn.events);
    expect(turn.unconsumedSteers()).toEqual(['inbox notice']);
});

test('an interjection Grok injected into the conversation reached the model', async () => {
    const { finishPrompt, grok, turn } = await runningTurn();
    expect(await grok.session.steer('inbox notice')).toEqual({ delivered: true });
    grok.send({
        method: '_x.ai/session/interjection',
        params: { sessionId: 's-1', text: 'inbox notice' },
    });
    finishPrompt({ stopReason: 'end_turn' });
    await drain(turn.events);
    expect(turn.unconsumedSteers()).toEqual([]);
});

test('a cancelled turn returns the interjection it never injected', async () => {
    const { finishPrompt, grok, turn } = await runningTurn();
    expect(await grok.session.steer('inbox notice')).toEqual({ delivered: true });
    finishPrompt({ stopReason: 'cancelled' });
    expect((await drain(turn.events)).at(-1)).toEqual({ type: 'abort' });
    expect(turn.unconsumedSteers()).toEqual(['inbox notice']);
});

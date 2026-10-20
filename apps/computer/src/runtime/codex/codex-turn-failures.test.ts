// Ported from botiverse/raft-source packages/daemon/src/drivers/codex.test.ts (FSL-1.1-ALv2)
import { describe, expect, test } from 'bun:test';
import {
    emitTurn,
    flush,
    labels,
    runningFakeTurn as running,
    turnCompleted,
    usage,
} from './testing/session-harness.ts';

describe('Codex turn failures and isolation', () => {
    test('secondary-thread lifecycle, text, and status notifications are ignored', async () => {
        const { fake, turn } = await running();
        fake.emit({
            method: 'turn/started',
            params: { threadId: 'thread-2', turn: { id: 'turn-x' } },
        });
        fake.emit({
            method: 'item/agentMessage/delta',
            params: { delta: 'wrong thread', itemId: 'x', threadId: 'thread-2' },
        });
        fake.emit({
            method: 'thread/status/changed',
            params: { status: { type: 'systemError' }, threadId: 'thread-2' },
        });
        fake.emit({
            method: 'turn/completed',
            params: { threadId: 'thread-2', turn: { id: 'turn-x', status: 'failed' } },
        });
        usage(fake, turn.turnId);
        turnCompleted(fake, turn.turnId);
        expect(labels(await turn.finished)).toEqual(['step-finish', 'turn-finish']);
    });

    test('a systemError ends the turn with the reason Codex sends after it', async () => {
        const { fake, turn } = await running();
        fake.notify('thread/status/changed', { status: { type: 'systemError' } });
        emitTurn(fake, turn.turnId, 'error', {
            error: { codexErrorInfo: 'other', message: 'model not supported' },
            willRetry: false,
        });
        turnCompleted(fake, turn.turnId, 'failed', { message: 'model not supported' });
        expect(labels(await turn.finished)).toEqual([
            'session-failure:error:service:model not supported',
            'turn-finish',
            'error:model not supported',
        ]);
    });

    test('retryable errors are non-terminal warnings; a 401 retry is an access failure', async () => {
        const { fake, turn } = await running();
        emitTurn(fake, turn.turnId, 'error', {
            error: {
                codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 502 } },
                message: 'Reconnecting... 1/5',
            },
            willRetry: true,
        });
        emitTurn(fake, turn.turnId, 'error', {
            error: {
                codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 401 } },
                message: 'Reconnecting... 2/5',
            },
            willRetry: true,
        });
        emitTurn(fake, turn.turnId, 'error', {
            error: { codexErrorInfo: 'usageLimitExceeded', message: 'quota' },
            willRetry: false,
        });
        turnCompleted(fake, turn.turnId, 'failed', { message: 'quota' });
        expect(labels(await turn.finished)).toEqual([
            'session-failure:warning:connection:Reconnecting... 1/5',
            'session-failure:warning:access:Reconnecting... 2/5',
            'session-failure:error:limit:quota',
            'turn-finish',
            'error:quota',
        ]);
    });

    test('raw CLI capacity error lines are runtime errors', async () => {
        const { fake, turn } = await running();
        fake.raw(JSON.stringify({ message: 'Selected model is at capacity.', type: 'error' }));
        fake.raw(JSON.stringify({ error: { message: 'Still at capacity.' }, type: 'turn.failed' }));
        turnCompleted(fake, turn.turnId, 'failed', { message: 'capacity' });
        expect(labels(await turn.finished).slice(0, 2)).toEqual([
            'error:Selected model is at capacity.',
            'error:Still at capacity.',
        ]);
    });

    test('raw reasoning text stays liveness; summaries are reasoning', async () => {
        const { fake, turn } = await running();
        emitTurn(fake, turn.turnId, 'item/reasoning/textDelta', {
            delta: 'raw hidden',
            itemId: 'r-1',
        });
        emitTurn(fake, turn.turnId, 'item/completed', {
            item: {
                content: ['raw hidden fallback'],
                id: 'r-1',
                summary: ['safe summary'],
                type: 'reasoning',
            },
        });
        emitTurn(fake, turn.turnId, 'item/reasoning/summaryTextDelta', {
            delta: 'streamed',
            itemId: 'r-2',
        });
        emitTurn(fake, turn.turnId, 'item/completed', {
            item: { id: 'r-2', summary: ['streamed'], type: 'reasoning' },
        });
        turnCompleted(fake, turn.turnId);
        expect(labels(await turn.finished)).toEqual([
            'reasoning-start',
            'reasoning-delta:safe summary',
            'reasoning-end',
            'reasoning-start',
            'reasoning-delta:streamed',
            'reasoning-end',
            'turn-finish',
        ]);
    });

    test('a turn Codex interrupts on its own is not a success', async () => {
        const { fake, turn } = await running();
        turnCompleted(fake, turn.turnId, 'interrupted', { message: 'user aborted' });
        expect(labels(await turn.finished)).toEqual([
            'turn-finish',
            'error:Codex turn interrupted: user aborted',
        ]);
    });

    test('every wire notification yields at least one event', async () => {
        const { fake, turn } = await running();
        await flush();
        const before = turn.events.length;
        fake.notify('account/rateLimits/updated', { rateLimits: {} });
        fake.notify('turn/diff/updated', { diff: '', turnId: turn.turnId });
        fake.raw('not json at all');
        await flush();
        expect(turn.events.length - before).toBe(3);
        expect(turn.events.slice(before).every((event) => event.type === 'progress')).toBe(true);
    });
});

// Ported from botiverse/raft-source packages/daemon/src/drivers/codexBlankFinalAnswer.contract.test.ts (FSL-1.1-ALv2)
import { describe, expect, test } from 'bun:test';
import type { TurnEvent } from '../turn-event.ts';
import {
    emitTurn,
    openFake,
    startFakeTurn,
    turnCompleted,
    turnStarted,
} from './testing/session-harness.ts';

/** Same length (98) as the specimen's commentary; the characters are synthetic. */
const COMMENTARY_TEXT = 'C'.repeat(98);
/** Byte-for-byte the specimen's `final_answer` payload. */
const BLANK_FINAL_ANSWER = '\n\n';

const message = (id: string, phase: string | null, text: string) => ({
    item: { id, memoryCitation: null, phase, text, type: 'agentMessage' },
});

/** Replays the specimen's final turn: commentary, then a whitespace-only final answer. */
async function replaySpecimen(options: { finalText?: string; streamDeltas?: boolean } = {}) {
    const { fake, session } = await openFake();
    const turn = await startFakeTurn(fake, session);
    const { turnId } = turn;
    const finalText = options.finalText ?? BLANK_FINAL_ANSWER;
    const stream = options.streamDeltas ?? true;
    turnStarted(fake, turnId);
    emitTurn(fake, turnId, 'item/started', message('msg-commentary', 'commentary', ''));
    if (stream) {
        emitTurn(fake, turnId, 'item/agentMessage/delta', {
            delta: COMMENTARY_TEXT,
            itemId: 'msg-commentary',
        });
    }
    emitTurn(
        fake,
        turnId,
        'item/completed',
        message('msg-commentary', 'commentary', COMMENTARY_TEXT)
    );
    emitTurn(fake, turnId, 'item/started', message('msg-final', 'final_answer', ''));
    if (stream) {
        emitTurn(fake, turnId, 'item/agentMessage/delta', {
            delta: finalText,
            itemId: 'msg-final',
        });
    }
    emitTurn(fake, turnId, 'item/completed', message('msg-final', 'final_answer', finalText));
    turnCompleted(fake, turnId);
    return await turn.finished;
}

function answerText(events: readonly TurnEvent[]): string {
    return events.flatMap((event) => (event.type === 'text-delta' ? [event.text] : [])).join('');
}

function blankReports(events: readonly TurnEvent[]) {
    return events.filter(
        (event) => event.type === 'progress' && event.nativeType === 'codex_blank_final_answer'
    );
}

describe('#816 blank final answer', () => {
    test('a blank final_answer is never delivered as answer text', async () => {
        expect(answerText(await replaySpecimen())).toBe('');
    });

    test('the blank terminator is reported once, as observable liveness', async () => {
        expect(blankReports(await replaySpecimen())).toHaveLength(1);
    });

    test('the same holds when the messages arrive only as completed items', async () => {
        const events = await replaySpecimen({ streamDeltas: false });
        expect(answerText(events)).toBe('');
        expect(blankReports(events)).toHaveLength(1);
    });

    test('the turn still completes normally: its work is not lost', async () => {
        const events = await replaySpecimen();
        expect(events.at(-1)?.type).toBe('turn-finish');
    });

    test('leading whitespace before a real answer is held and released verbatim', async () => {
        const { fake, session } = await openFake();
        const turn = await startFakeTurn(fake, session);
        turnStarted(fake, turn.turnId);
        emitTurn(fake, turn.turnId, 'item/started', message('m', 'final_answer', ''));
        emitTurn(fake, turn.turnId, 'item/agentMessage/delta', { delta: '\n', itemId: 'm' });
        emitTurn(fake, turn.turnId, 'item/agentMessage/delta', { delta: 'Answer', itemId: 'm' });
        emitTurn(fake, turn.turnId, 'item/agentMessage/delta', { delta: ' \n', itemId: 'm' });
        turnCompleted(fake, turn.turnId);
        const events = await turn.finished;
        expect(answerText(events)).toBe('\nAnswer \n');
        expect(blankReports(events)).toHaveLength(0);
    });

    test('a non-blank final answer is delivered and not reported', async () => {
        const events = await replaySpecimen({ finalText: 'Done.' });
        expect(answerText(events)).toBe('Done.');
        expect(blankReports(events)).toHaveLength(0);
    });

    test('a tool-only turn with no assistant text is legitimately silent', async () => {
        const { fake, session } = await openFake();
        const turn = await startFakeTurn(fake, session);
        turnStarted(fake, turn.turnId);
        emitTurn(fake, turn.turnId, 'item/completed', {
            item: {
                command: 'ls',
                commandActions: [],
                exitCode: 0,
                id: 'c',
                status: 'completed',
                type: 'commandExecution',
            },
        });
        turnCompleted(fake, turn.turnId);
        expect(blankReports(await turn.finished)).toHaveLength(0);
    });

    test('an earlier answered turn never makes a later blank turn look answered', async () => {
        const { fake, session } = await openFake();
        const first = await startFakeTurn(fake, session);
        turnStarted(fake, first.turnId);
        emitTurn(fake, first.turnId, 'item/completed', message('a', 'final_answer', 'First.'));
        turnCompleted(fake, first.turnId);
        expect(blankReports(await first.finished)).toHaveLength(0);
        const second = await startFakeTurn(fake, session);
        turnStarted(fake, second.turnId);
        emitTurn(
            fake,
            second.turnId,
            'item/completed',
            message('b', 'commentary', COMMENTARY_TEXT)
        );
        emitTurn(
            fake,
            second.turnId,
            'item/completed',
            message('c', 'final_answer', BLANK_FINAL_ANSWER)
        );
        turnCompleted(fake, second.turnId);
        expect(blankReports(await second.finished)).toHaveLength(1);
    });
});

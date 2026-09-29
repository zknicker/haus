import { describe, expect, test } from 'bun:test';
import type { ThoughtStream } from './agent-thought-summarizer.ts';
import {
    createThoughtCadence,
    type ThoughtJob,
    thoughtFindingFloorMs,
    thoughtFindingRank,
    thoughtFirstSpacingMs,
    thoughtFloorMs,
    thoughtStillAfterMs,
} from './thought-cadence.ts';

/** A fake clock and timer queue, with jobs that resolve when the test says. */
function harness() {
    let clock = 0;
    const timers = new Set<{ at: number; run: () => void }>();
    const shown: { at: number; text: string }[] = [];
    const phrased: string[] = [];
    const tasks: Promise<void>[] = [];
    const cadence = createThoughtCadence({
        now: () => clock,
        schedule: (run, ms) => {
            const timer = { at: clock + ms, run };
            timers.add(timer);
            return () => timers.delete(timer);
        },
    });
    const job = (text: string | null, stream: ThoughtStream = 'new', rank = 1): ThoughtJob => ({
        phrase: async () => {
            phrased.push(text ?? '(skip)');
            return text ? { announce: () => shown.push({ at: clock, text }), stream } : null;
        },
        rank,
        run: (task) => {
            tasks.push(task());
        },
    });
    const settle = async () => {
        while (tasks.length > 0) {
            await tasks.shift();
        }
    };
    return {
        advance: async (ms: number) => {
            const until = clock + ms;
            for (;;) {
                const due = [...timers]
                    .filter((timer) => timer.at <= until)
                    .sort((a, b) => a.at - b.at)[0];
                if (!due) {
                    break;
                }
                clock = Math.max(clock, due.at);
                timers.delete(due);
                due.run();
                await settle();
            }
            clock = until;
        },
        offer: async (text: string | null, stream?: ThoughtStream, rank?: number) => {
            cadence.offer('run', job(text, stream, rank));
            await settle();
        },
        phrased,
        shown,
    };
}

describe('thought cadence', () => {
    test('shows the first line early; a skipped opening holds it back a second at most', async () => {
        const run = harness();
        await run.offer(null);
        await run.advance(thoughtFirstSpacingMs - 1);
        await run.offer('Pulling the forecast');
        expect(run.shown).toEqual([]);
        await run.advance(1);
        expect(run.shown).toEqual([{ at: thoughtFirstSpacingMs, text: 'Pulling the forecast' }]);
    });

    test('holds frames inside the floor, keeping the best one, then shows it', async () => {
        const run = harness();
        await run.offer('Pulling the forecast');
        await run.advance(2000);
        await run.offer('Scanning alerts', 'new', 1);
        await run.offer("Saturday looks wet, Sunday's clearer", 'new', 2);
        await run.offer('Reading notes', 'new', 0);
        expect(run.phrased).toEqual(['Pulling the forecast']);
        await run.advance(thoughtFloorMs);
        expect(run.shown.map((line) => [line.at, line.text])).toEqual([
            [0, 'Pulling the forecast'],
            [thoughtFloorMs, "Saturday looks wet, Sunday's clearer"],
        ]);
    });

    test('shows a continuing line only after a quiet stretch, holding the freshest', async () => {
        const run = harness();
        await run.offer('Reading the Bun release notes');
        await run.advance(thoughtFloorMs);
        await run.offer('Still scanning the notes', 'still');
        await run.advance(5000);
        await run.offer('Still digging through the changelog', 'still');
        expect(run.shown).toHaveLength(1);
        await run.advance(thoughtStillAfterMs - thoughtFloorMs - 5000);
        expect(run.shown.map((line) => [line.at, line.text])).toEqual([
            [0, 'Reading the Bun release notes'],
            [thoughtStillAfterMs, 'Still digging through the changelog'],
        ]);
        // After that, a continuing line phrased past the quiet stretch shows at once.
        await run.advance(thoughtStillAfterMs);
        await run.offer('Still comparing the HTTP changes', 'still');
        expect(run.shown.at(-1)).toEqual({
            at: 2 * thoughtStillAfterMs,
            text: 'Still comparing the HTTP changes',
        });
    });

    test('a finding waits out a shorter floor', async () => {
        const run = harness();
        await run.offer('Pulling the forecast');
        await run.advance(2000);
        await run.offer("Saturday's dry", 'new', thoughtFindingRank);
        await run.advance(thoughtFindingFloorMs - 2000);
        expect(run.shown.map((line) => [line.at, line.text])).toEqual([
            [0, 'Pulling the forecast'],
            [thoughtFindingFloorMs, "Saturday's dry"],
        ]);
    });

    test('a new line replaces a held continuing one', async () => {
        const run = harness();
        await run.offer('Reading the notes');
        await run.advance(thoughtFloorMs);
        await run.offer('Still reading the notes', 'still');
        await run.advance(5000);
        await run.offer('Comparing the releases');
        await run.advance(thoughtStillAfterMs);
        expect(run.shown.map((line) => line.text)).toEqual([
            'Reading the notes',
            'Comparing the releases',
        ]);
    });
});

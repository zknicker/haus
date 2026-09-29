// Sequence replay for the thought eval (ADR 0036): one run's frames at their
// offsets through the Server's workstream cadence on a fake clock, each phrased
// by the real summarizer against the lines already shown, then judged by the
// Server's novelty checks. Reports shown lines with their times, the budget,
// repeats, and the longest silent stretch after the first bubble.
import type {
    ThoughtSource,
    ThoughtSummarizer,
} from '../apps/server/src/server-agents/agent-thought-summarizer.ts';
import {
    createThoughtCadence,
    thoughtFindingRank,
} from '../apps/server/src/server-agents/thought-cadence.ts';
import { judgeThoughtLine } from '../apps/server/src/server-agents/thought-novelty.ts';
import { thoughtPreviousLineCount } from '../apps/server/src/server-agents/thought-previous-lines.ts';
import { type ThoughtRepeat, thoughtRepeat } from './thought-eval-checks.ts';

export type EvalFrameKind = 'action' | 'reasoning' | 'title';

/**
 * One run's frames in the order it produced them; `at` is seconds into the turn
 * (default five seconds per step), `endAt` when the turn ended (default five
 * seconds after the last step), and `minShown`/`maxShown` the budget.
 */
export interface EvalSequence {
    endAt?: number;
    id: string;
    maxShown?: number;
    minShown?: number;
    request: string;
    steps: { at?: number; kind: EvalFrameKind; result?: string; text: string }[];
}

export interface SequenceOutcome {
    dropped: string[];
    id: string;
    /** Longest stretch in seconds without a bubble, from the first bubble to the turn's end. */
    longestQuiet: number;
    maxShown: number | null;
    minShown: number | null;
    repeats: ThoughtRepeat[];
    run: number;
    shown: { at: number; stream: string; text: string }[];
}

/** Replays a sequence's frames as the Server would for one run in one Chat. */
export async function playSequence(
    item: EvalSequence,
    run: number,
    options: {
        caseSource: (
            step: EvalSequence['steps'][number],
            context: { previous?: string[]; request?: string }
        ) => ThoughtSource;
        summarizer: ThoughtSummarizer;
        withoutPrevious: boolean;
    }
): Promise<SequenceOutcome> {
    let clock = 0;
    const timers = new Set<{ at: number; run: () => void }>();
    const tasks: Promise<void>[] = [];
    const cadence = createThoughtCadence({
        now: () => clock,
        schedule: (task, ms) => {
            const timer = { at: clock + ms, run: task };
            timers.add(timer);
            return () => timers.delete(timer);
        },
    });
    const shown: SequenceOutcome['shown'] = [];
    const dropped: string[] = [];
    // Summaries take real time but land at the frame's own moment on the fake clock.
    const settle = async () => {
        while (tasks.length > 0) {
            await tasks.shift();
        }
    };
    const advanceTo = async (until: number) => {
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
        clock = Math.max(clock, until);
    };
    for (const [index, step] of item.steps.entries()) {
        await advanceTo((step.at ?? index * 5) * 1000);
        cadence.offer(item.id, {
            phrase: async () => {
                const previous = options.withoutPrevious
                    ? []
                    : shown.slice(-thoughtPreviousLineCount).map((line) => line.text);
                const summary = await options.summarizer.summarize(
                    options.caseSource(step, {
                        request: item.request,
                        ...(previous.length > 0 ? { previous } : {}),
                    })
                );
                if (summary?.kind !== 'phrase') {
                    return null;
                }
                const line = judgeThoughtLine(summary, {
                    finding: step.kind === 'action' && Boolean(step.result),
                    previous,
                    request: item.request,
                });
                if (!line) {
                    dropped.push(summary.text);
                    return null;
                }
                return {
                    announce: () => shown.push({ at: clock / 1000, ...line }),
                    stream: line.stream,
                };
            },
            rank: step.kind === 'action' ? (step.result ? thoughtFindingRank : 0) : 1,
            run: (task) => {
                tasks.push(task());
            },
        });
        await settle();
    }
    const last = item.steps.at(-1);
    const endAt = item.endAt ?? (last?.at ?? (item.steps.length - 1) * 5) + 5;
    await advanceTo(endAt * 1000);
    const texts = shown.map((line) => line.text);
    const repeats = texts.slice(1).map((line, index) => thoughtRepeat(texts[index] ?? '', line));
    const marks = [...shown.map((line) => line.at), endAt];
    const longestQuiet = marks.slice(1).reduce((most, at, index) => {
        return Math.max(most, at - (marks[index] ?? at));
    }, 0);
    return {
        dropped,
        id: item.id,
        longestQuiet,
        maxShown: item.maxShown ?? null,
        minShown: item.minShown ?? null,
        repeats,
        run,
        shown,
    };
}

export function reportSequences(results: SequenceOutcome[], withoutPrevious: boolean) {
    if (results.length === 0) {
        return;
    }
    console.log(`\nSequences (previous lines ${withoutPrevious ? 'off' : 'on'}):`);
    const outOfBudget = (outcome: SequenceOutcome) =>
        (outcome.maxShown !== null && outcome.shown.length > outcome.maxShown) ||
        (outcome.minShown !== null && outcome.shown.length < outcome.minShown);
    for (const outcome of results) {
        const budget = `${outcome.minShown ?? 0}–${outcome.maxShown ?? '-'}`;
        const filtered =
            outcome.dropped.length > 0
                ? `; filtered ${outcome.dropped.map((line) => `"${line}"`).join(', ')}`
                : '';
        console.log(
            `  ${outOfBudget(outcome) ? 'OUT ' : 'ok  '} ${outcome.id} run ${outcome.run}: ${outcome.shown.length} shown (${budget}), longest quiet ${outcome.longestQuiet}s${filtered}`
        );
        outcome.shown.forEach((line, index) => {
            const repeat = index > 0 ? outcome.repeats[index - 1] : null;
            const label = `${repeat ? repeat.toUpperCase() : ''}`.padEnd(15);
            console.log(
                `    ${label}+${String(line.at).padStart(3)}s ${line.stream.padEnd(5)} ${line.text}`
            );
        });
    }
    const repeats = results.flatMap((result) => result.repeats);
    const shown = results.reduce((total, result) => total + result.shown.length, 0);
    const share = (kind: ThoughtRepeat) => {
        const count = repeats.filter((repeat) => repeat === kind).length;
        return `${((count / Math.max(repeats.length, 1)) * 100).toFixed(1)}% (${count}/${repeats.length})`;
    };
    console.log(
        `  ${shown} shown lines, ${(shown / results.length).toFixed(2)} per sequence run; consecutive pairs ${repeats.length}`
    );
    console.log(`  duplicates ${share('duplicate')}, near-duplicates ${share('near-duplicate')}`);
    console.log(
        `  sequence runs outside their budget: ${results.filter(outOfBudget).length}/${results.length}`
    );
}

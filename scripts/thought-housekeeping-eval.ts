// Thought housekeeping eval (ADR 0036). Sends every labeled case in
// apps/server/src/server-agents/evals/thought-housekeeping-cases.json through the
// production Gemini thought summarizer and reports SKIP precision and recall, the
// phrase shown for each case, wording checks on every shown phrase (filler "now",
// length, per-case banned and required words, the share opening with "I"), and
// the local fallback filter on the same set.
//
// This is a dev tool, not CI: each case is a real Gemini call.
// Cases may carry a `request`, the human message the run is answering, and may be
// an `action` (a scrubbed command, file, or tool description) instead of a title or excerpt.
// An action may carry a `result`, the scrubbed excerpt of what it returned.
// Cases with `previous` lines are judged by workstream too: `show` should answer
// NEW, `still` STILL, `skip` SKIP.
// Sequences replay one run's frames through the Server's workstream cadence
// (thought-eval-sequences.ts); `--no-previous` sends them without the shown
// lines, the baseline.
// Usage: agent-varlock -- ./node_modules/.bin/varlock run -- bun scripts/thought-housekeeping-eval.ts [--only <ids or prefixes>] [--runs <n>] [--no-request] [--no-previous] [--sequences]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
    createGeminiThoughtSummarizer,
    type ThoughtSource,
    thoughtSummaryPromptVersion,
} from '../apps/server/src/server-agents/agent-thought-summarizer.ts';
import { isHousekeepingThought } from '../apps/server/src/server-agents/thought-housekeeping.ts';
import { condenseThoughtLocally } from '../packages/haus-api/src/agent-thought-phrase.ts';
import {
    checkThoughtPhrase,
    opensWithI,
    type ThoughtEvalRules,
    thoughtEvalMaxIOpeningShare,
} from './thought-eval-checks.ts';
import {
    type EvalFrameKind,
    type EvalSequence,
    playSequence,
    reportSequences,
    type SequenceOutcome,
} from './thought-eval-sequences.ts';

interface EvalCase {
    /** `still` (only with `previous`) expects a STILL answer, and counts as shown for SKIP scores. */
    expected: 'show' | 'skip' | 'still';
    id: string;
    kind: EvalFrameKind;
    /** Lines the run already showed, sent as the Server sends them after a first line. */
    previous?: string[];
    /** The human message the run is answering, sent as `<request>` context. */
    request?: string;
    /** For an action: the scrubbed excerpt of what it returned. */
    result?: string;
    rules?: ThoughtEvalRules;
    text: string;
}
interface Outcome {
    answer: string;
    expected: EvalCase['expected'];
    fallbackSkip: boolean;
    id: string;
    problems: string[];
    run: number;
    /** The model's workstream label, for cases with `previous` lines. */
    stream: 'new' | 'skip' | 'still' | null;
}

const corpusPath = 'apps/server/src/server-agents/evals/thought-housekeeping-cases.json';
const apiKey = process.env.HAUS_GEMINI_API_KEY;
if (!apiKey) {
    throw new Error('HAUS_GEMINI_API_KEY is not set; run through varlock.');
}
const summarizer = createGeminiThoughtSummarizer({ apiKey, timeoutMs: 15_000 });
const corpus = JSON.parse(await readFile(corpusPath, 'utf8')) as {
    cases: EvalCase[];
    sequences: EvalSequence[];
};
const flag = (name: string) =>
    process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const only = flag('--only');
// Sends request cases without their request, to measure what the context adds.
const withoutRequest = process.argv.includes('--no-request');
// Sends sequence steps without the previous lines, to measure what they add.
const withoutPrevious = process.argv.includes('--no-previous');
const runs = Number(flag('--runs') ?? 1);
// Runs only the sequences, for quick prompt iteration on repeats.
const sequencesOnly = process.argv.includes('--sequences');
// `--only` takes comma-separated ids or id prefixes ("finding-,still-").
const picked = (id: string) => !only || only.split(',').some((prefix) => id.startsWith(prefix));
const cases = corpus.cases.filter((item) => !sequencesOnly && picked(item.id));
const sequences = corpus.sequences.filter((item) => picked(item.id));
const outcomes: Outcome[] = [];
const sequenceOutcomes: SequenceOutcome[] = [];
for (let run = 1; run <= runs; run += 1) {
    for (let index = 0; index < cases.length; index += 4) {
        const batch = cases.slice(index, index + 4);
        outcomes.push(...(await Promise.all(batch.map((item) => judgeCase(item, run)))));
    }
    sequenceOutcomes.push(
        ...(await Promise.all(
            sequences.map((item) =>
                playSequence(item, run, { caseSource, summarizer, withoutPrevious })
            )
        ))
    );
}
report(outcomes);
reportSequences(sequenceOutcomes, withoutPrevious);
const directory = path.join('.context/thought-housekeeping-eval');
await mkdir(directory, { recursive: true });
const file = path.join(directory, `${thoughtSummaryPromptVersion}-${Date.now()}.json`);
await writeFile(
    file,
    `${JSON.stringify({ outcomes, promptVersion: thoughtSummaryPromptVersion, sequenceOutcomes, withoutPrevious }, null, 4)}\n`
);
console.log(`\nraw outcomes: ${file}`);

async function judgeCase(item: EvalCase, run: number): Promise<Outcome> {
    const context = {
        ...(item.request && !withoutRequest ? { request: item.request } : {}),
        ...(item.previous ? { previous: item.previous } : {}),
    };
    const summary = await summarizer.summarize(caseSource(item, context));
    return {
        answer: summary === null ? '(failed)' : summary.kind === 'skip' ? 'SKIP' : summary.text,
        expected: item.expected,
        stream:
            item.previous && summary ? (summary.kind === 'skip' ? 'skip' : summary.stream) : null,
        problems: summary?.kind === 'phrase' ? checkThoughtPhrase(summary.text, item.rules) : [],
        fallbackSkip:
            isHousekeepingThought(item.text) ||
            (item.kind === 'reasoning' && condenseThoughtLocally(item.text) === null),
        id: item.id,
        run,
    };
}

function caseSource(
    item: Pick<EvalCase, 'kind' | 'result' | 'text'>,
    context: { previous?: string[]; request?: string }
): ThoughtSource {
    switch (item.kind) {
        case 'action':
            return {
                action: item.text,
                kind: 'action',
                ...(item.result ? { result: item.result } : {}),
                ...context,
            };
        case 'title':
            return { kind: 'title', title: item.text, ...context };
        default:
            return { kind: 'reasoning', reasoning: item.text, ...context };
    }
}

function report(results: Outcome[]) {
    if (results.length === 0) {
        return;
    }
    for (const outcome of results) {
        const skipped = outcome.answer === 'SKIP';
        const correct = skipped === (outcome.expected === 'skip');
        const streamMiss = outcome.stream !== null && outcome.stream !== expectedStream(outcome);
        const verdict = correct
            ? streamMiss
                ? 'STRM'
                : outcome.problems.length > 0
                  ? 'WORD'
                  : 'ok  '
            : 'MISS';
        const problems = outcome.problems.length > 0 ? `  [${outcome.problems.join('; ')}]` : '';
        console.log(
            `${verdict} ${outcome.id.padEnd(26)} expected=${outcome.expected.padEnd(5)} → ${outcome.stream && outcome.stream !== 'skip' ? `${outcome.stream.toUpperCase()}: ` : ''}${outcome.answer}${problems}`
        );
    }
    const withRequest = new Set(cases.filter((item) => item.request).map((item) => item.id));
    const failed = results.filter((outcome) => outcome.answer === '(failed)').length;
    const answered = results.filter((outcome) => outcome.answer !== '(failed)');
    console.log(`\nGemini (${answered.length} answered, ${failed} failed):`);
    printScores(answered.map((outcome) => [outcome.answer === 'SKIP', outcome.expected]));
    printWording(answered.filter((outcome) => outcome.answer !== 'SKIP'));
    const judged = answered.filter((outcome) => outcome.stream !== null);
    const streamHits = judged.filter((outcome) => outcome.stream === expectedStream(outcome));
    console.log(
        `  workstream label (cases with shown lines): ${streamHits.length}/${judged.length} as expected`
    );
    const requestCases = answered.filter((outcome) => withRequest.has(outcome.id));
    console.log(`\nCases with a request (${requestCases.length} answered):`);
    printScores(requestCases.map((outcome) => [outcome.answer === 'SKIP', outcome.expected]));
    printWording(requestCases.filter((outcome) => outcome.answer !== 'SKIP'));
    console.log('\nLocal fallback filter:');
    printScores(results.map((outcome) => [outcome.fallbackSkip, outcome.expected]));
}

/** What a case with shown lines should answer: show → NEW, still → STILL, skip → SKIP. */
function expectedStream(outcome: Outcome): Outcome['stream'] {
    return outcome.expected === 'show' ? 'new' : outcome.expected;
}

function printWording(shown: Outcome[]) {
    const count = (predicate: (outcome: Outcome) => boolean) => shown.filter(predicate).length;
    const iOpenings = count((outcome) => opensWithI(outcome.answer));
    const share = iOpenings / Math.max(shown.length, 1);
    const verdict = (passed: boolean) => (passed ? 'pass' : 'FAIL');
    const filler = count((outcome) => outcome.problems.includes('filler "now"'));
    const long = count((outcome) => outcome.problems.some((problem) => problem.endsWith(' words')));
    const ruled = count((outcome) =>
        outcome.problems.some(
            (problem) => problem.startsWith('banned') || problem.startsWith('mentions')
        )
    );
    console.log(`  shown phrases ${shown.length}`);
    console.log(
        `  ${verdict(share <= thoughtEvalMaxIOpeningShare)} open with "I": ${(share * 100).toFixed(1)}% (${iOpenings}/${shown.length}, max ${(thoughtEvalMaxIOpeningShare * 100).toFixed(0)}%)`
    );
    console.log(`  ${verdict(filler === 0)} filler "right now"/trailing "now": ${filler}`);
    console.log(`  ${verdict(long === 0)} over eight words: ${long}`);
    console.log(`  ${verdict(ruled === 0)} per-case banned/required word misses: ${ruled}`);
}

function printScores(pairs: [boolean, EvalCase['expected']][]) {
    const truePositive = pairs.filter(([skip, expected]) => skip && expected === 'skip').length;
    const falsePositive = pairs.filter(([skip, expected]) => skip && expected === 'show').length;
    const falseNegative = pairs.filter(([skip, expected]) => !skip && expected === 'skip').length;
    const precision = truePositive / Math.max(truePositive + falsePositive, 1);
    const recall = truePositive / Math.max(truePositive + falseNegative, 1);
    console.log(
        `  skip precision ${(precision * 100).toFixed(1)}% (${truePositive}/${truePositive + falsePositive}), recall ${(recall * 100).toFixed(1)}% (${truePositive}/${truePositive + falseNegative})`
    );
}

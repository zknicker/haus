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
// Sequences phrase one request's steps in order, each with the last two shown lines as
// its previous status, and report how often consecutive shown lines repeat;
// `--no-previous` sends them without it, the baseline.
// Usage: agent-varlock -- ./node_modules/.bin/varlock run -- bun scripts/thought-housekeeping-eval.ts [--only <id>] [--runs <n>] [--no-request] [--no-previous] [--sequences]
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
    type ThoughtRepeat,
    thoughtEvalMaxIOpeningShare,
    thoughtRepeat,
} from './thought-eval-checks.ts';

interface EvalCase {
    expected: 'show' | 'skip';
    id: string;
    kind: 'action' | 'reasoning' | 'title';
    /** The human message the run is answering, sent as `<request>` context. */
    request?: string;
    rules?: ThoughtEvalRules;
    text: string;
}
/** One request's titles and actions in the order a real run produced them. */
interface EvalSequence {
    id: string;
    request: string;
    steps: { kind: EvalCase['kind']; text: string }[];
}
interface SequenceOutcome {
    id: string;
    repeats: ThoughtRepeat[];
    run: number;
    shown: string[];
}
interface Outcome {
    answer: string;
    expected: EvalCase['expected'];
    fallbackSkip: boolean;
    id: string;
    problems: string[];
    run: number;
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
const cases = corpus.cases.filter((item) => !(sequencesOnly || (only && item.id !== only)));
const sequences = corpus.sequences.filter((item) => !only || item.id === only);
const outcomes: Outcome[] = [];
const sequenceOutcomes: SequenceOutcome[] = [];
for (let run = 1; run <= runs; run += 1) {
    for (let index = 0; index < cases.length; index += 4) {
        const batch = cases.slice(index, index + 4);
        outcomes.push(...(await Promise.all(batch.map((item) => judgeCase(item, run)))));
    }
    sequenceOutcomes.push(...(await Promise.all(sequences.map((item) => playSequence(item, run)))));
}
report(outcomes);
reportSequences(sequenceOutcomes);
const directory = path.join('.context/thought-housekeeping-eval');
await mkdir(directory, { recursive: true });
const file = path.join(directory, `${thoughtSummaryPromptVersion}-${Date.now()}.json`);
await writeFile(
    file,
    `${JSON.stringify({ outcomes, promptVersion: thoughtSummaryPromptVersion, sequenceOutcomes, withoutPrevious }, null, 4)}\n`
);
console.log(`\nraw outcomes: ${file}`);

async function judgeCase(item: EvalCase, run: number): Promise<Outcome> {
    const context = item.request && !withoutRequest ? { request: item.request } : {};
    const summary = await summarizer.summarize(caseSource(item, context));
    return {
        answer: summary === null ? '(failed)' : summary.kind === 'skip' ? 'SKIP' : summary.text,
        expected: item.expected,
        problems: summary?.kind === 'phrase' ? checkThoughtPhrase(summary.text, item.rules) : [],
        fallbackSkip:
            isHousekeepingThought(item.text) ||
            (item.kind === 'reasoning' && condenseThoughtLocally(item.text) === null),
        id: item.id,
        run,
    };
}

/** Phrases a sequence's steps in order, as the Server would for one run in one Chat. */
async function playSequence(item: EvalSequence, run: number): Promise<SequenceOutcome> {
    const shown: string[] = [];
    for (const step of item.steps) {
        const previous = withoutPrevious ? [] : shown.slice(-2);
        const summary = await summarizer.summarize(
            caseSource(step, {
                request: item.request,
                ...(previous.length > 0 ? { previous } : {}),
            })
        );
        if (summary?.kind === 'phrase') {
            shown.push(summary.text);
        }
    }
    const repeats = shown.slice(1).map((line, index) => thoughtRepeat(shown[index] ?? '', line));
    return { id: item.id, repeats, run, shown };
}

function reportSequences(results: SequenceOutcome[]) {
    if (results.length === 0) {
        return;
    }
    console.log(`\nSequences (previous lines ${withoutPrevious ? 'off' : 'on'}):`);
    for (const outcome of results.filter((result) => result.run === 1)) {
        console.log(`  ${outcome.id}`);
        outcome.shown.forEach((line, index) => {
            const repeat = index > 0 ? outcome.repeats[index - 1] : null;
            console.log(`    ${repeat ? repeat.toUpperCase().padEnd(15) : ''.padEnd(15)}${line}`);
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
}

function caseSource(
    item: Pick<EvalCase, 'kind' | 'text'>,
    context: { previous?: string[]; request?: string }
): ThoughtSource {
    switch (item.kind) {
        case 'action':
            return { action: item.text, kind: 'action', ...context };
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
        const verdict = correct ? (outcome.problems.length > 0 ? 'WORD' : 'ok  ') : 'MISS';
        const problems = outcome.problems.length > 0 ? `  [${outcome.problems.join('; ')}]` : '';
        console.log(
            `${verdict} ${outcome.id.padEnd(26)} expected=${outcome.expected.padEnd(4)} → ${outcome.answer}${problems}`
        );
    }
    const withRequest = new Set(cases.filter((item) => item.request).map((item) => item.id));
    const failed = results.filter((outcome) => outcome.answer === '(failed)').length;
    const answered = results.filter((outcome) => outcome.answer !== '(failed)');
    console.log(`\nGemini (${answered.length} answered, ${failed} failed):`);
    printScores(answered.map((outcome) => [outcome.answer === 'SKIP', outcome.expected]));
    printWording(answered.filter((outcome) => outcome.answer !== 'SKIP'));
    const requestCases = answered.filter((outcome) => withRequest.has(outcome.id));
    console.log(`\nCases with a request (${requestCases.length} answered):`);
    printScores(requestCases.map((outcome) => [outcome.answer === 'SKIP', outcome.expected]));
    printWording(requestCases.filter((outcome) => outcome.answer !== 'SKIP'));
    console.log('\nLocal fallback filter:');
    printScores(results.map((outcome) => [outcome.fallbackSkip, outcome.expected]));
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

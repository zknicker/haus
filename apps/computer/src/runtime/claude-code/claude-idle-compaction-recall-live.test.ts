import { expect, test } from 'bun:test';
import type { ClaudeResumeState } from '../resume-state.ts';
import {
    lastContextTokens,
    ledger,
    liveLog,
    openIdleCompactionLive,
    runLiveTurn,
    textOf,
} from './fixtures/idle-compaction-live.ts';

// What an idle compaction keeps of a big session. Three turns build about 500K tokens of
// context on Haiku 5.5 with facts planted early, mid-session (buried in filler), and last, plus a
// task left half done. Haus idle compaction runs `/compact` on the parked process (timer
// shortened to 5s), then one turn asks for every fact, one never stated, and the task. It
// prints a scorecard; it fails only when no compaction ran or the Agent lost its current task.
// Costs under a dollar of Haiku usage.
//   HAUS_RUN_LIVE_CLAUDE_IDLE_RECALL_TEST=1 bun test apps/computer/src/runtime/claude-code/claude-idle-compaction-recall-live.test.ts
const recallTest = process.env.HAUS_RUN_LIVE_CLAUDE_IDLE_RECALL_TEST === '1' ? test : test.skip;

const facts = [
    { answer: /persimmon/iu, name: 'vault word (early)' },
    { answer: /okonkwo/iu, name: 'client (early)' },
    { answer: /marisol|quint/iu, name: 'auditor (mid, buried in turn 1 filler)' },
    { answer: /gx-?7781/iu, name: 'generator serial (mid, buried in turn 2 filler)' },
    { answer: /tangerine-?42/iu, name: 'harbor code (recent)' },
    { answer: /\b63\b/u, name: 'crate 10 fittings (one filler line)' },
] as const;

recallTest(
    'a ~500K-token session keeps its planted facts and current task through idle compaction',
    async () => {
        const live = await openIdleCompactionLive({ dueInMs: 5000 });
        try {
            const first = await live.driver().openSession({
                resumeFrom: undefined,
                sessionId: 'agt_idle-recall',
            });
            const turns = [
                `The vault word is PERSIMMON. The client is Okonkwo Freight. Remember both.\n\n${ledger('Alpha', 5500, { at: 2750, text: 'AUDIT NOTE: the auditor on file is Marisol Quint.' })}\n\nReply with exactly: logged`,
                `${ledger('Beta', 5500, { at: 3000, text: 'AUDIT NOTE: the backup generator serial is GX-7781.' })}\n\nReply with exactly: logged`,
                `${ledger('Gamma', 4000)}\n\nLatest update: the harbor code is TANGERINE-42. Remember it.\n\nYour current task: you are migrating the billing tables in three steps. Step 1, export the invoices, is done. Step 2, rewriting the currency column to integer cents, is in progress: you stopped at the table invoice_lines. Step 3, re-indexing, has not started. Reply with exactly: noted`,
            ];
            let context = 0;
            for (const [index, prompt] of turns.entries()) {
                const events = await runLiveTurn(first, prompt);
                expect(events.at(-1)).toMatchObject({ type: 'turn-finish' });
                context = lastContextTokens(events);
                liveLog(`turn ${index + 1}: context ${context} tokens, reply ${textOf(events)}`);
            }
            const parked = (await first.detach()) as ClaudeResumeState;
            const result = await live.compacted;
            liveLog(
                `compaction: ${JSON.stringify({ ...result, summary: undefined })}\nsummary:\n${result.summary}`
            );
            expect(result.tokensBefore).toBeGreaterThan(200_000);

            const second = await live.driver().openSession({
                resumeFrom: parked,
                sessionId: 'agt_idle-recall',
            });
            const recall = await runLiveTurn(
                second,
                [
                    'Without using any tools, answer from memory, one numbered line each. Say "unknown" when you do not know; do not guess.',
                    '1) the vault word, 2) the client, 3) the auditor on file, 4) the backup generator serial, 5) the harbor code, 6) how many brass fittings crate 10 of the Alpha ledger holds, 7) the warehouse manager’s name, 8) your current task: which step you are on and exactly where you stopped.',
                ].join('\n')
            );
            const reply = textOf(recall);
            const lines = reply.split('\n');
            const lineFor = (index: number) =>
                lines.find((line) => line.trim().startsWith(`${index}`)) ?? '';
            const scorecard = facts.map((fact, index) => ({
                fact: fact.name,
                kept: fact.answer.test(lineFor(index + 1)),
            }));
            const neverStated = lineFor(7);
            const task = lineFor(8);
            liveLog(
                `recall context ${lastContextTokens(recall)} tokens\nreply:\n${reply}\n${JSON.stringify(
                    {
                        hallucinatedManager: !/unknown|not (been )?(stated|mentioned|given)/iu.test(
                            neverStated
                        ),
                        scorecard,
                        taskKept: /cents|currency/iu.test(task) && /invoice_lines/iu.test(task),
                    },
                    null,
                    2
                )}`
            );
            await second.stop();
            expect(task).toMatch(/invoice_lines/iu);
        } finally {
            await live.close();
        }
    },
    20 * 60_000
);

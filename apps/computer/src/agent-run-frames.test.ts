import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunFrames, journalChangeIntervalMs } from './agent-run-frames.ts';
import { createComputerExecutionJournal } from './harness/execution-journal.ts';

test('journal-change notices go out at most once a second, and the last change always gets one', () => {
    const sent: unknown[] = [];
    let clock = 0;
    const timers: { at: number; run: () => void }[] = [];
    const advance = (ms: number) => {
        clock += ms;
        for (const timer of timers.splice(0).sort((a, b) => a.at - b.at)) {
            if (timer.at <= clock) {
                timer.run();
            } else {
                timers.push(timer);
            }
        }
    };
    const frames = createRunFrames({
        agentId: 'agt_frames',
        now: () => clock,
        runId: 'run_frames',
        schedule: (run, ms) => timers.push({ at: clock + ms, run }),
        sendFrame: (frame) => sent.push(frame),
    });

    frames.journalChanged();
    expect(sent).toEqual([
        { agentId: 'agt_frames', runId: 'run_frames', type: 'agent-execution-journal-changed' },
    ]);
    // A reasoning burst inside the window collapses into one trailing notice.
    for (let i = 0; i < 8; i++) {
        advance(100);
        frames.journalChanged();
    }
    expect(sent).toHaveLength(1);
    expect(timers).toHaveLength(1);
    advance(journalChangeIntervalMs);
    expect(sent).toHaveLength(2);
    advance(10 * journalChangeIntervalMs);
    expect(sent).toHaveLength(2);
});

test('the journal announces a change only after its records are on disk', async () => {
    const agentRoot = await mkdtemp(join(tmpdir(), 'haus-journal-notice-'));
    try {
        const notices: number[] = [];
        const journal = await createComputerExecutionJournal({
            activity: { journalChanged: () => notices.push(notices.length) },
            agentRoot,
            runId: 'run_notice',
        });
        journal.recordReasoningStart({ id: 'thought' });
        journal.appendReasoning({ id: 'thought', text: 'Checking the queue.' });
        expect(notices).toHaveLength(0);
        await journal.flushReasoning();
        expect(notices).toHaveLength(1);
        // Nothing pending writes nothing and announces nothing.
        await journal.flushReasoning();
        expect(notices).toHaveLength(1);
        await journal.recordToolCall({ toolCallId: 'call_1', toolName: 'bash' });
        expect(notices).toHaveLength(2);
    } finally {
        await rm(agentRoot, { force: true, recursive: true });
    }
});

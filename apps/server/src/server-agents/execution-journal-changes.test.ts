import { expect, test } from 'bun:test';
import {
    journalChangeIntervalMs,
    publishExecutionJournalChange,
    subscribeToExecutionJournalChanges,
} from './execution-journal-changes.ts';

test('a burst of journal changes yields one leading and one trailing notice per run', async () => {
    let now = 0;
    const scheduled: { at: number; run: () => void }[] = [];
    const clock = {
        now: () => now,
        schedule: (run: () => void, ms: number) => scheduled.push({ at: now + ms, run }),
    };
    // Each step lets the subscriber read what was emitted before time moves on.
    const advance = async (to: number) => {
        await Bun.sleep(0);
        now = to;
        for (const task of scheduled.splice(0).sort((a, b) => a.at - b.at)) {
            if (task.at <= now) {
                task.run();
            } else {
                scheduled.push(task);
            }
        }
        await Bun.sleep(0);
    };
    const heard: string[] = [];
    const controller = new AbortController();
    const listening = (async () => {
        try {
            for await (const change of subscribeToExecutionJournalChanges(controller.signal)) {
                heard.push(`${change.runId}@${now}`);
            }
        } catch {
            // Aborted.
        }
    })();
    await Bun.sleep(0);

    const change = (runId: string) => ({ agentId: 'agt_1', runId, serverId: 'srv_throttle' });
    publishExecutionJournalChange(change('run_a'), clock);
    publishExecutionJournalChange(change('run_a'), clock);
    publishExecutionJournalChange(change('run_b'), clock);
    await advance(300);
    publishExecutionJournalChange(change('run_a'), clock);
    await advance(journalChangeIntervalMs);
    await advance(journalChangeIntervalMs * 3);
    publishExecutionJournalChange(change('run_a'), clock);
    await Bun.sleep(0);
    controller.abort();
    await listening;

    expect(heard).toEqual(['run_a@0', 'run_b@0', 'run_a@1000', 'run_a@3000']);
});

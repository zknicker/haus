import { expect, test } from 'bun:test';
import { ClaudeBackgroundTasks } from './claude-background.ts';
import type { ClaudeSystemMessage } from './claude-messages.ts';

const changed = (
    tasks: { parent_task_id?: string; run_id?: string; task_id: string; task_type: string }[]
): ClaudeSystemMessage => ({ subtype: 'background_tasks_changed', tasks, type: 'system' });

test('a task keeps its start across reports of the same run', () => {
    const tracked = new ClaudeBackgroundTasks();
    expect(
        tracked.apply(changed([{ run_id: 'r1', task_id: 'a', task_type: 'local_agent' }]), 10)
    ).toBe(true);
    expect(
        tracked.apply(
            changed([
                { run_id: 'r1', task_id: 'a', task_type: 'local_agent' },
                // A sub-agent's own background shell counts as a task, not a sub-agent.
                { parent_task_id: 'a', run_id: 'r2', task_id: 'b', task_type: 'local_bash' },
            ]),
            20
        )
    ).toBe(true);
    expect(tracked.since).toBe(10);
    expect(tracked.work).toEqual({ subagents: 1, tasks: 2 });
});

test('a continued sub-agent keeps its task id under a new run, whose lifetime starts over', () => {
    const tracked = new ClaudeBackgroundTasks();
    tracked.apply(changed([{ run_id: 'r1', task_id: 'a', task_type: 'local_agent' }]), 10);
    // Reported under the next run with no report between them.
    expect(
        tracked.apply(changed([{ run_id: 'r3', task_id: 'a', task_type: 'local_agent' }]), 30)
    ).toBe(true);
    expect(tracked.since).toBe(30);
});

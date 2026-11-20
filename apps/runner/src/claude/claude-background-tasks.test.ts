import { expect, test } from 'bun:test';
import { ClaudeBackgroundTasks } from './claude-background-tasks.ts';
import { parseClaudeMessage } from './claude-messages.ts';

function changed(tasks: Record<string, unknown>[]) {
    const parsed = parseClaudeMessage({
        subtype: 'background_tasks_changed',
        tasks,
        type: 'system',
    });
    if (parsed.message.kind !== 'system') {
        throw new Error('not a system message');
    }
    return parsed.message.message;
}

test('background work is every live task or sub-agent the last change listed', () => {
    const tasks = new ClaudeBackgroundTasks();
    expect(tasks.running).toBe(false);
    tasks.apply(changed([{ task_id: 'a', task_type: 'local_agent' }]));
    expect(tasks.running).toBe(true);
    tasks.apply(changed([{ task_id: 'b', task_type: 'local_bash' }]));
    expect(tasks.running).toBe(true);
    tasks.apply(changed([]));
    expect(tasks.running).toBe(false);
});

test('an ambient task is not activity, and other system messages change nothing', () => {
    const tasks = new ClaudeBackgroundTasks();
    tasks.apply(changed([{ ambient: true, task_id: 'a', task_type: 'monitor' }]));
    expect(tasks.running).toBe(false);
    tasks.apply(changed([{ task_id: 'b', task_type: 'local_agent' }]));
    const other = parseClaudeMessage({ subtype: 'status', type: 'system' });
    if (other.message.kind === 'system') {
        tasks.apply(other.message.message);
    }
    expect(tasks.running).toBe(true);
});

test('a session that ended holds nothing', () => {
    const tasks = new ClaudeBackgroundTasks();
    tasks.apply(changed([{ task_id: 'a', task_type: 'local_agent' }]));
    tasks.clear();
    expect(tasks.running).toBe(false);
});

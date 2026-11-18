import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatDueOn } from '../tasks/task-facts.tsx';
import { TaskHoverCardView } from './task-hover-card.tsx';

const task = {
    dueOn: '2026-11-10',
    key: 'SEC-12',
    priority: 'high',
    state: 'open',
    title: 'Rate-limit Trigger webhook endpoints',
} as const;

test('the card names the key, state, title, assignee, priority, and due day', () => {
    const markup = renderToStaticMarkup(
        <TaskHoverCardView
            assignee={{ avatarUrl: null, label: 'Forge' }}
            displayLabel="SEC-12"
            isUnavailable={false}
            task={task}
        />
    );

    for (const fact of ['SEC-12', 'Open', task.title, 'Forge', 'High']) {
        expect(markup).toContain(fact);
    }
    expect(markup).toContain(`Due ${formatDueOn(task.dueOn)}`);
});

test('before its read lands the card says only what the chip already said', () => {
    const markup = renderToStaticMarkup(
        <TaskHoverCardView
            assignee={null}
            displayLabel="SEC-12"
            isUnavailable={false}
            task={null}
        />
    );

    expect(markup).toContain('SEC-12');
    expect(markup).not.toContain('unavailable');
});

test('a Task that cannot be read says so', () => {
    const markup = renderToStaticMarkup(
        <TaskHoverCardView assignee={null} displayLabel="SEC-12" isUnavailable task={null} />
    );

    expect(markup).toContain('Task unavailable');
});

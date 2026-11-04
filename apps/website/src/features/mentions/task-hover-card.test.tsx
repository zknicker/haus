import { expect, test } from 'bun:test';
import type { Board } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatDueOn } from '../tasks/task-facts.tsx';
import { TaskHoverCardView } from './task-hover-card.tsx';

const board: Pick<Board, 'columns' | 'name'> = {
    columns: [{ category: 'todo', id: 'col_todo', name: 'Todo', position: 0 }],
    name: 'Security',
};
const task = {
    category: 'todo',
    columnId: 'col_todo',
    dueOn: '2026-11-10',
    key: 'SEC-12',
    priority: 'high',
    title: 'Rate-limit Trigger webhook endpoints',
} as const;

test('the card names the key, column, board, title, assignee, priority, and due day', () => {
    const markup = renderToStaticMarkup(
        <TaskHoverCardView
            assignee={{ avatarUrl: null, label: 'Forge' }}
            board={board}
            displayLabel="SEC-12"
            isUnavailable={false}
            task={task}
        />
    );

    for (const fact of ['SEC-12', 'Todo', 'Security', task.title, 'Forge', 'High']) {
        expect(markup).toContain(fact);
    }
    expect(markup).toContain(`Due ${formatDueOn(task.dueOn)}`);
});

test('before its read lands the card says only what the chip already said', () => {
    const markup = renderToStaticMarkup(
        <TaskHoverCardView
            assignee={null}
            board={null}
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
        <TaskHoverCardView
            assignee={null}
            board={null}
            displayLabel="SEC-12"
            isUnavailable
            task={null}
        />
    );

    expect(markup).toContain('Task unavailable');
});

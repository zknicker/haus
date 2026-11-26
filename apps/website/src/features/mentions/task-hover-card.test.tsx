import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TaskHoverCardView } from './task-hover-card.tsx';

const task = {
    archivedAt: null,
    shortId: 'k3mq7xta',
    title: 'Rate-limit Trigger webhook endpoints',
} as const;

test('the card names the title, whether it is active, and who started it', () => {
    const markup = renderToStaticMarkup(
        <TaskHoverCardView
            displayLabel="the webhooks Task"
            isUnavailable={false}
            starter={{ avatarUrl: null, label: 'Forge' }}
            task={task}
        />
    );

    for (const fact of ['Active', task.title, 'Started by Forge']) {
        expect(markup).toContain(fact);
    }
});

test('before its read lands the card says only what the chip already said', () => {
    const markup = renderToStaticMarkup(
        <TaskHoverCardView
            displayLabel="the webhooks Task"
            isUnavailable={false}
            starter={null}
            task={null}
        />
    );

    expect(markup).toContain('the webhooks Task');
    expect(markup).not.toContain('unavailable');
});

test('a Task that cannot be read says so', () => {
    const markup = renderToStaticMarkup(
        <TaskHoverCardView
            displayLabel="the webhooks Task"
            isUnavailable
            starter={null}
            task={null}
        />
    );

    expect(markup).toContain('Task unavailable');
});

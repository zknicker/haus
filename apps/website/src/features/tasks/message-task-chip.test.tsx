import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessageTaskChip } from './message-task-chip.tsx';
import type { MessageTask } from './task-presentation.ts';

test('the chip leads with the number and names the assignee', () => {
    const html = renderToStaticMarkup(
        <MessageTaskChip
            assigneeProfile={{ avatarUrl: null, name: 'Blippy' }}
            task={task({ status: 'in_progress' })}
        />
    );

    expect(html).toContain('Task #7');
    expect(html).toContain('Blippy');
    // The status is a disc, so the word itself has to reach a screen reader.
    expect(html).toContain('In progress');
    // The assignee is the only part that gives way when the row runs out of room.
    expect(html).toContain('truncate');
});

test('an unassigned task states itself without inventing an owner', () => {
    const html = renderToStaticMarkup(<MessageTaskChip task={task({ assignee: null })} />);

    expect(html).toContain('Task #7');
    expect(html).toContain('Todo');
});

test('an assignee with no resolved profile falls back to their handle', () => {
    const html = renderToStaticMarkup(<MessageTaskChip task={task({})} />);

    expect(html).toContain('@ada');
});

function task(overrides: Partial<MessageTask>): MessageTask {
    return {
        assignee: { handle: 'ada', id: 'agt_ada', kind: 'agent' },
        live: false,
        number: 7,
        status: 'todo',
        tier: 'tracked',
        ...overrides,
    };
}

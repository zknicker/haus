import { expect, test } from 'bun:test';
import { getManualTopic } from './index.ts';

test('the tasks topic teaches pacing, finishing, and references, and keeps claims separate', () => {
    const body = getManualTopic('tasks')?.body;
    expect(body).toContain('**Pacing: one active Task at a time.**');
    expect(body).toContain('Moving the card is the status update.');
    expect(body).toContain('no pickup note');
    expect(body).toContain('3 more assigned to you in todo');
    expect(body).toContain('the active card holds your place');
    expect(body).toContain('A Task takes no claim.');
    // Decision 8: a Reminder cannot anchor on a Task, which has no Chat to answer in.
    expect(body).toContain('Write the bare key in a message');
    expect(body).toContain('anchors on a message where that work lives');
    expect(body).toContain('names the key in its description');
    expect(body).toContain('`REGULAR_TURN_REQUIRED`');
    expect(body).not.toContain('—');
    expect(getManualTopic('claims')?.body).toContain('queued work on a board is a Task');
});

test('the boards topic teaches categories and every column edit', () => {
    const body = getManualTopic('boards')?.body;
    expect(body).toContain("The category is what a Task's state means");
    for (const edit of ['add', 'rename', 'move', 'remove']) {
        expect(body).toContain(`haus board columns SEC ${edit}`);
    }
    expect(body).toContain('`--move-to <column>`');
    expect(body).not.toContain('—');
});

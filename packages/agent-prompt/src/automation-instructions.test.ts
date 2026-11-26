import { expect, test } from 'bun:test';
import { remindersSection, triggersSection } from './automation-instructions.ts';

const fireToTask = 'that message is the origin of a Task';

test('a fire answers top-level with --cause', () => {
    expect(remindersSection).toContain(
        'Answer a fire with a new top-level message in the anchor chat, sent with `--cause <fireId>`'
    );
    expect(triggersSection).toContain(
        'Answer a trigger fire with a new top-level message in the anchor chat, sent with `--cause <fireId>`'
    );
});

test('fire sections leave Task creation to the Tasks section', () => {
    expect(remindersSection).not.toContain(fireToTask);
    expect(triggersSection).not.toContain(fireToTask);
});

test('a one-time reminder is set on the Task itself and wakes the Agent there', () => {
    expect(remindersSection).toContain(
        'A one-time reminder for work on a Task targets the Task, `--target task:<shortId>`, and wakes you there.'
    );
    expect(remindersSection).not.toContain('anchored in a Task');
    expect(remindersSection).not.toContain('instead of a message ID');
});

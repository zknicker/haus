import { expect, test } from 'bun:test';
import { remindersSection, triggersSection } from './automation-instructions.ts';

const fireToTask =
    'When the fire turns up work your reply will not finish, that message is the origin of a Task: start the Task from it and work there.';

test('a fire whose reply is the whole of the work still answers top-level with --cause', () => {
    expect(remindersSection).toContain(
        'Answer a fire with a new top-level message in the anchor chat, sent with `--cause <fireId>`'
    );
    expect(triggersSection).toContain(
        'Answer a trigger fire with a new top-level message in the anchor chat, sent with `--cause <fireId>`'
    );
});

test('a fire that turns up real work makes its top-level answer the origin of a Task (ADR 0052)', () => {
    expect(remindersSection).toContain(fireToTask);
    expect(triggersSection).toContain(fireToTask);
});

test('a one-time reminder is set on the Task itself and wakes the Agent there', () => {
    expect(remindersSection).toContain(
        'For work on a Task, set a one-time reminder with `--target task:<KEY-n>` instead of a message ID; it wakes you on that Task, and you answer there.'
    );
    expect(remindersSection).not.toContain('anchored in a Task');
});

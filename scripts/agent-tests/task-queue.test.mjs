import { describe, expect, test } from 'bun:test';
import { paceOf, queueSteps } from './task-queue.mjs';

const columns = new Map([
    ['todo', 'todo'],
    ['in progress', 'active'],
    ['done', 'done'],
]);

function tool(command, output = '', status = 'completed') {
    return { input: { command }, output, status };
}

const move = (key, column, output) => tool(`haus task move ${key} --column ${column}`, output);

describe('queueSteps', () => {
    test('reads quoted and bare columns, and any flag order', () => {
        const steps = queueSteps(
            [
                tool('haus task move QABC-1 --column "In progress"'),
                tool("haus task move --column 'in progress' QABC-2"),
                tool('haus task move QABC-3 --column Done', 'Moved QABC-3 to Done [done].'),
            ],
            columns
        );
        expect(steps.map(({ category, key }) => [key, category])).toEqual([
            ['QABC-1', 'active'],
            ['QABC-2', 'active'],
            ['QABC-3', 'done'],
        ]);
        expect(steps[2]?.output).toBe('Moved QABC-3 to Done [done].');
    });

    test('a refused move and any other command change nothing', () => {
        expect(
            queueSteps(
                [
                    tool('haus task move QABC-1 --column Doing', 'no such column', 'failed'),
                    tool('haus task move QABC-1 --column Nope'),
                    tool('haus task list'),
                ],
                columns
            )
        ).toEqual([]);
    });

    test('a chained command counts each move, and a send is a step', () => {
        const steps = queueSteps(
            [
                tool('haus task move QABC-1 --column Done && haus task move QABC-2 --column Done'),
                tool("haus message send --target dm:@zach <<'HAUSMSG'\nDone.\nHAUSMSG"),
            ],
            columns
        );
        expect(steps.map((step) => step.key ?? step.kind)).toEqual(['QABC-1', 'QABC-2', 'send']);
    });
});

describe('paceOf', () => {
    test('a queue worked one card at a time', () => {
        const pace = paceOf(
            queueSteps(
                [
                    move('QABC-3', '"In progress"'),
                    move('QABC-3', 'Done', '2 more assigned to you in todo'),
                    move('QABC-2', '"In progress"'),
                    move('QABC-2', 'Done', '1 more assigned to you in todo'),
                    move('QABC-1', '"In progress"'),
                    move('QABC-1', 'Done', ''),
                    tool('haus message send --target dm:@zach'),
                ],
                columns
            )
        );
        expect(pace).toEqual({
            finished: ['QABC-3', 'QABC-2', 'QABC-1'],
            mostActive: 1,
            receipts: ['2 more assigned to you in todo', '1 more assigned to you in todo', ''],
            sends: 1,
            sendsBeforeLastFinish: 0,
            skippedActive: [],
            started: ['QABC-3', 'QABC-2', 'QABC-1'],
        });
    });

    test('two cards active at once and a card that skipped active both show', () => {
        const pace = paceOf(
            queueSteps(
                [
                    move('QABC-1', '"In progress"'),
                    move('QABC-2', '"In progress"'),
                    move('QABC-3', 'Done'),
                ],
                columns
            )
        );
        expect(pace.mostActive).toBe(2);
        expect(pace.skippedActive).toEqual(['QABC-3']);
    });

    test('a pickup note counts as a send before the last finish', () => {
        const pace = paceOf(
            queueSteps(
                [
                    tool('haus message send --target dm:@zach'),
                    move('QABC-1', '"In progress"'),
                    move('QABC-1', 'Done'),
                    tool('haus message send --target dm:@zach'),
                ],
                columns
            )
        );
        expect(pace.sends).toBe(2);
        expect(pace.sendsBeforeLastFinish).toBe(1);
    });
});

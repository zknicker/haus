import { describe, expect, test } from 'bun:test';
import { validReminderDescription, validReminderTitle } from './reminder-model.ts';

const teaching =
    'Reminder title must be one line of at most 60 characters: a short label like a calendar invite subject, such as "Monday Advertising Review". Put the full instruction in --description.';

describe('reminder labels', () => {
    test('keeps a short title, trimmed', () => {
        expect(validReminderTitle('  Monday Advertising Review ')).toBe(
            'Monday Advertising Review'
        );
        expect(validReminderTitle('x'.repeat(60))).toHaveLength(60);
    });

    test('teaches the label format when a title is a sentence or spans lines', () => {
        expect(() => validReminderTitle('x'.repeat(61))).toThrow(teaching);
        expect(() => validReminderTitle('Monday review\nand bids')).toThrow(teaching);
        expect(() => validReminderTitle('   ')).toThrow('Reminder title is required.');
    });

    test('bounds the description at 300 characters', () => {
        expect(validReminderDescription(` ${'d'.repeat(300)} `)).toHaveLength(300);
        expect(() => validReminderDescription('d'.repeat(301))).toThrow(
            'Reminder description must be between 1 and 300 characters.'
        );
        expect(() => validReminderDescription('  ')).toThrow();
    });
});

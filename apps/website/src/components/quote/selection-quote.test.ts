import { describe, expect, test } from 'bun:test';
import { appendComposerInsert } from '../../commands/chat-composer-insert.ts';
import { buildQuoteInsert } from './selection-quote.tsx';

describe('selection quote', () => {
    test('quotes every selected line and appends the haus:// source link', () => {
        const insert = buildQuoteInsert('first line\nsecond line', {
            href: 'haus://workspace/projects/alpha.md',
            label: 'projects/alpha.md',
        });
        expect(insert).toBe(
            '> first line\n> second line\n\n[projects/alpha.md](haus://workspace/projects/alpha.md)\n\n'
        );
    });

    test('composer insert appends below existing draft text', () => {
        expect(appendComposerInsert('', '> q\n\n')).toBe('> q\n\n');
        expect(appendComposerInsert('draft text\n', '> q\n\n[a](b)\n\n')).toBe(
            'draft text\n\n> q\n\n[a](b)\n\n'
        );
    });
});

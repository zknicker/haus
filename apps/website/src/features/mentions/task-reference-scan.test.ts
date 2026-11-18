import { describe, expect, test } from 'bun:test';
import type { TaskLink } from '@haus/api';
import { readMentionsFromMarkdown } from './mention-metadata.ts';
import { prepareMarkdownReferences } from './reference-markdown.tsx';
import { applyTaskLinks, readTaskKey } from './task-reference-scan.ts';

const sec12: TaskLink = { key: 'SEC-12', taskId: 'tsk_12', text: 'SEC-12' };

function chipsIn(content: string, links: readonly TaskLink[] = [sec12]) {
    return applyTaskLinks(readMentionsFromMarkdown(content), content, links).filter(
        (mention) => mention.kind === 'task'
    );
}

describe('applyTaskLinks', () => {
    test('a bare key becomes a task mention over its exact text', () => {
        const [mention] = chipsIn('Does SEC-12 cover GitHub?');

        expect(mention).toMatchObject({
            end: 11,
            id: 'task://tsk_12',
            kind: 'task',
            label: 'SEC-12',
            projection: 'task-reference',
            start: 5,
            text: 'SEC-12',
        });
        expect(readTaskKey(mention?.metadata)).toBe('SEC-12');
    });

    test('every occurrence of the key is a chip', () => {
        expect(chipsIn('SEC-12, then SEC-12.').map((mention) => mention.start)).toEqual([0, 13]);
    });

    test('it stands against punctuation but never inside a longer token', () => {
        expect(chipsIn('(SEC-12)')).toHaveLength(1);
        expect(chipsIn('SEC-123 and XSEC-12 and SEC-12-b and a/SEC-12')).toHaveLength(0);
    });

    test('code, links, and plain URLs keep their text', () => {
        const content = [
            'Inline `SEC-12` code.',
            '```',
            'SEC-12',
            '```',
            'A [SEC-12 fix](https://example.com) link.',
            'https://example.com/SEC-12 url.',
        ].join('\n');

        expect(chipsIn(content)).toHaveLength(0);
    });

    test('only a key the Server resolved renders, and only where its text occurs', () => {
        expect(chipsIn('SEC-99 stays text.')).toHaveLength(0);
        expect(chipsIn('Nothing here.')).toHaveLength(0);
    });

    test('an explicit link keeps its label and gains its key', () => {
        const content = 'See [the limit](task://tsk_12).';
        const link = { key: 'SEC-12', taskId: 'tsk_12', text: '[the limit](task://tsk_12)' };
        const [mention] = chipsIn(content, [link]);

        expect(mention).toMatchObject({ label: 'the limit', start: 4 });
        expect(readTaskKey(mention?.metadata)).toBe('SEC-12');
    });

    test('a key beside an explicit link to the same Task is its own chip', () => {
        const content = 'SEC-12 is [the limit](task://tsk_12).';
        const explicit = { ...sec12, text: '[the limit](task://tsk_12)' };

        expect(chipsIn(content, [sec12, explicit]).map((mention) => mention.label)).toEqual([
            'SEC-12',
            'the limit',
        ]);
    });

    test('a message with no links hands its mentions straight back', () => {
        const mentions = readMentionsFromMarkdown('Hi');
        expect(applyTaskLinks(mentions, 'Hi', [])).toBe(mentions);
        expect(applyTaskLinks(mentions, 'Hi', undefined)).toBe(mentions);
    });
});

describe('prepareMarkdownReferences', () => {
    test('a bare key gains a link the chip renders from', () => {
        const content = 'Does SEC-12 cover [@Ada](user://usr_a)?';
        const mentions = applyTaskLinks(readMentionsFromMarkdown(content), content, [sec12]);

        const prepared = prepareMarkdownReferences(content, mentions);

        expect(prepared.content).toBe(
            'Does [SEC-12](https://references.haus.invalid/0) cover [@Ada](https://references.haus.invalid/1)?'
        );
        expect(prepared.links.get('https://references.haus.invalid/0')).toMatchObject({
            kind: 'reference',
            reference: { id: 'task://tsk_12', kind: 'task' },
        });
    });

    test('an explicit Task link is retargeted, not wrapped again', () => {
        const content = 'See [the limit](task://tsk_12).';
        const prepared = prepareMarkdownReferences(content);

        expect(prepared.content).toBe('See [the limit](https://references.haus.invalid/0).');
    });
});

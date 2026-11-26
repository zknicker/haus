import { describe, expect, test } from 'bun:test';
import type { TaskLink } from '@haus/api';
import { readMentionsFromMarkdown } from './mention-metadata.ts';
import { prepareMarkdownReferences } from './reference-markdown.tsx';
import { applyTaskLinks, readTaskLink } from './task-reference-scan.ts';

const limit: TaskLink = {
    shortId: 'k3mq7xta',
    taskId: 'tsk_12',
    text: '[the limit](task://tsk_12)',
};

function chipsIn(content: string, links: readonly TaskLink[] = [limit]) {
    return applyTaskLinks(readMentionsFromMarkdown(content), links).filter(
        (mention) => mention.kind === 'task'
    );
}

describe('applyTaskLinks', () => {
    test('an explicit link keeps its label and gains the Task id and short id', () => {
        const [mention] = chipsIn('See [the limit](task://tsk_12).');

        expect(mention).toMatchObject({ id: 'task://tsk_12', label: 'the limit', start: 4 });
        expect(readTaskLink(mention?.metadata)).toEqual({ shortId: 'k3mq7xta', taskId: 'tsk_12' });
    });

    test('a link by short id resolves to the same Task', () => {
        const [mention] = chipsIn('See [it](task://k3mq7xta).', [
            { ...limit, text: '[it](task://k3mq7xta)' },
        ]);

        expect(readTaskLink(mention?.metadata)).toEqual({ shortId: 'k3mq7xta', taskId: 'tsk_12' });
    });

    test('a bare code is an Issue, never a Task chip', () => {
        expect(chipsIn('Does GEN-12 cover GitHub?')).toHaveLength(0);
    });

    test('a link the Server did not resolve carries no Task facts', () => {
        const [mention] = chipsIn('See [x](task://tsk_missing).');
        expect(readTaskLink(mention?.metadata)).toEqual({ shortId: undefined, taskId: undefined });
    });

    test('a message with no links hands its mentions straight back', () => {
        const mentions = readMentionsFromMarkdown('Hi');
        expect(applyTaskLinks(mentions, [])).toBe(mentions);
        expect(applyTaskLinks(mentions, undefined)).toBe(mentions);
    });
});

describe('prepareMarkdownReferences', () => {
    test('an explicit Task link is retargeted, not wrapped again', () => {
        const content = 'See [the limit](task://tsk_12).';
        const prepared = prepareMarkdownReferences(content);

        expect(prepared.content).toBe('See [the limit](https://references.haus.invalid/0).');
    });
});

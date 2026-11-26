import { expect, test } from 'bun:test';
import { readMarkdownSpans } from '@haus/api';
import { taskReferenceMarkdown } from './copy-task-reference.ts';

test('a bracketed title still copies as one task link', () => {
    for (const title of ['[Bug] Crash', 'Close the ] bracket', 'Path C:\\tmp [x']) {
        const markdown = taskReferenceMarkdown({ id: 'tsk_alpha', title });
        const { links } = readMarkdownSpans(markdown);
        expect(links).toHaveLength(1);
        expect(links[0]).toMatchObject({ end: markdown.length, start: 0, url: 'task://tsk_alpha' });
    }
});

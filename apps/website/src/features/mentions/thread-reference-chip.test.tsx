import { expect, test } from 'bun:test';
import { threadReferenceTitle } from './thread-reference-chip.tsx';

test('Thread titles use the first readable line rather than channel ids or Markdown', () => {
    expect(
        threadReferenceTitle({
            body: { kind: 'text' },
            content: '\n# Recover **trademark** discovery\nThe worker needs retry backoff.',
        })
    ).toBe('Recover trademark discovery');
    expect(
        threadReferenceTitle({
            body: { kind: 'text' },
            content: '[Assignment](https://example.com)\nDetails',
        })
    ).toBe('Assignment');
    expect(threadReferenceTitle({ body: { kind: 'text' }, content: 'x'.repeat(80) })).toHaveLength(
        64
    );
    expect(threadReferenceTitle({ body: { kind: 'text' }, content: '' })).toBe('Thread');
});

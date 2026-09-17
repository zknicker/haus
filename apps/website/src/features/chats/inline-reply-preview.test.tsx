import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { InlineReplyPreview } from './inline-reply-preview.tsx';

test('inline reply preview exposes the quoted parent and jump label', () => {
    const markup = renderToStaticMarkup(
        <InlineReplyPreview
            onPress={() => undefined}
            reference={{
                author: {
                    kind: 'human',
                    profile: {
                        avatarUrl: null,
                        deleted: false,
                        description: null,
                        displayName: 'Zach',
                    },
                    userId: 'usr_zach',
                },
                content: 'Please ship this today',
                createdAt: '2026-08-22T12:00:00.000Z',
                id: 'msg_parent',
                sequence: 4,
            }}
        />
    );

    expect(markup).toContain('data-inline-reply-preview');
    expect(markup).toContain('Zach');
    expect(markup).not.toContain('Replying to');
    expect(markup).toContain('Please ship this today');
    expect(markup).toContain('Jump to Zach&#x27;s message');
});

import { describe, expect, test } from 'bun:test';
import { conversationPreviewLine } from './conversation-preview.ts';

const createdAt = '2025-05-08T15:00:00.000Z';

describe('conversationPreviewLine', () => {
    test('names the author, then quotes the line', () => {
        expect(
            conversationPreviewLine({
                authorDisplayName: 'Blippy',
                content: 'Shipped the release notes.',
                createdAt,
            })
        ).toBe('Blippy: Shipped the release notes.');
    });

    test('flattens Markdown and references the way every other quote does', () => {
        expect(
            conversationPreviewLine({
                authorDisplayName: 'Zach',
                content: '## Heading\n- posted in [#product](haus:chat/cht_1)\n\n**done**',
                createdAt,
            })
        ).toBe('Zach: Heading posted in #product done');
    });

    test('a message with no text still names who sent it', () => {
        expect(conversationPreviewLine({ authorDisplayName: 'Tiny', content: '', createdAt })).toBe(
            'Tiny'
        );
    });

    test('a Chat with no message yet has no line', () => {
        expect(conversationPreviewLine(null)).toBeNull();
    });

    test('the DM peer speaks unattributed inside their own DM', () => {
        expect(
            conversationPreviewLine(
                { authorDisplayName: 'Tiny', content: 'Finished the audit.', createdAt },
                { peerDisplayName: 'Tiny', viewerDisplayName: 'Zach' }
            )
        ).toBe('Finished the audit.');
    });

    test('the viewer is marked as themselves, in a DM and in a Channel', () => {
        expect(
            conversationPreviewLine(
                { authorDisplayName: 'Zach', content: 'On it.', createdAt },
                { peerDisplayName: 'Tiny', viewerDisplayName: 'Zach' }
            )
        ).toBe('You: On it.');
        expect(
            conversationPreviewLine(
                { authorDisplayName: 'Zach', content: 'On it.', createdAt },
                { viewerDisplayName: 'Zach' }
            )
        ).toBe('You: On it.');
    });

    test('a Channel keeps every name, the peer Agent included', () => {
        expect(
            conversationPreviewLine(
                { authorDisplayName: 'Tiny', content: 'Two build questions landed.', createdAt },
                { viewerDisplayName: 'Zach' }
            )
        ).toBe('Tiny: Two build questions landed.');
    });

    test('anyone else in a DM is still named', () => {
        expect(
            conversationPreviewLine(
                { authorDisplayName: 'Cove', content: 'Looping in.', createdAt },
                { peerDisplayName: 'Tiny', viewerDisplayName: 'Zach' }
            )
        ).toBe('Cove: Looping in.');
    });

    test('an attachment from the peer names them rather than saying nothing', () => {
        expect(
            conversationPreviewLine(
                { authorDisplayName: 'Tiny', content: '', createdAt },
                { peerDisplayName: 'Tiny' }
            )
        ).toBe('Tiny');
    });
});

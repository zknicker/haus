import { describe, expect, test } from 'bun:test';
import {
    conversationPreviewLine,
    threadAnchorLine,
    threadReplyPreviewLine,
    waitingMessageLine,
} from './conversation-preview.ts';

describe('waitingMessageLine', () => {
    test('sets the author apart from what they said', () => {
        expect(
            waitingMessageLine({
                authorName: 'Blippy',
                content: 'Thursday release check',
                peerDisplayName: null,
            })
        ).toEqual({ author: 'Blippy', text: 'Thursday release check' });
    });

    test('in a DM the peer speaks unattributed', () => {
        expect(
            waitingMessageLine({
                authorName: 'Tiny',
                content: 'Which first?',
                peerDisplayName: 'Tiny',
            })
        ).toEqual({ author: null, text: 'Which first?' });
    });

    test('a message with nothing to quote names its author alone', () => {
        expect(
            waitingMessageLine({ authorName: 'Tiny', content: '', peerDisplayName: null })
        ).toEqual({ author: null, text: 'Tiny' });
    });
});

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

describe('threadReplyPreviewLine', () => {
    test('says who replied in the thread, then quotes the reply', () => {
        expect(
            threadReplyPreviewLine(
                { authorDisplayName: 'Forge', content: 'Fixed the **flake**.', createdAt },
                'Zach'
            )
        ).toBe('Forge replied in thread: Fixed the flake.');
    });

    test("the viewer's own reply reads as theirs, and an empty one names only who", () => {
        expect(
            threadReplyPreviewLine({ authorDisplayName: 'Zach', content: '', createdAt }, 'Zach')
        ).toBe('You replied in thread');
    });

    test('a reply that no longer resolves still says the Thread has news', () => {
        expect(threadReplyPreviewLine(null, 'Zach')).toBe('New replies in thread');
    });
});

describe('threadAnchorLine', () => {
    test('names the anchor author, then quotes the anchor flattened', () => {
        expect(
            threadAnchorLine({
                authorName: 'Beacon',
                content: '**Thursday** Christmas check in [#ops](haus:chat/cht_1)',
                isViewer: false,
            })
        ).toBe('on Beacon: Thursday Christmas check in #ops');
    });

    test("the viewer's own anchor reads as theirs", () => {
        expect(threadAnchorLine({ authorName: 'Zach', content: 'Ship it?', isViewer: true })).toBe(
            'on your message: Ship it?'
        );
    });

    test('an anchor with no text names its author, and an unnamed one still quotes', () => {
        expect(threadAnchorLine({ authorName: 'Tiny', content: '', isViewer: false })).toBe(
            'on Tiny'
        );
        expect(threadAnchorLine({ authorName: null, content: 'Hello', isViewer: false })).toBe(
            'on: Hello'
        );
    });
});

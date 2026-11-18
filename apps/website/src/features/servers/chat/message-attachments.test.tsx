import { expect, test } from 'bun:test';
import type { AttachmentMetadata } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { attachmentImageKeys } from '../../../hooks/servers/attachment-image.ts';
import {
    describeAttachment,
    hostedAttachmentItems,
    localAttachmentItems,
} from './attachment-view.ts';
import { MessageAttachments } from './message-attachments.tsx';

const serverId = 'server_one';
const image = (id: string, extra: Partial<AttachmentMetadata> = {}): AttachmentMetadata => ({
    filename: `${id}.png`,
    id,
    mediaType: 'image/png',
    sizeBytes: 159_700,
    ...extra,
});

function render(attachments: AttachmentMetadata[], decoded: Record<string, [number, number]>) {
    const client = new QueryClient();
    for (const [id, [width, height]] of Object.entries(decoded)) {
        client.setQueryData(attachmentImageKeys.hosted(serverId, id), {
            height,
            url: `blob:${id}`,
            width,
        });
    }
    return renderToStaticMarkup(
        <QueryClientProvider client={client}>
            <MessageAttachments
                attachments={hostedAttachmentItems(attachments, serverId)}
                onDownload={() => undefined}
            />
        </QueryClientProvider>
    );
}

test('an image renders as a fixed strip tile, cropped rather than sized by its pixels', () => {
    const markup = render([image('orbit')], { orbit: [1600, 900] });

    expect(markup).toContain('data-slot="message-media-strip"');
    expect(markup).toContain('src="blob:orbit"');
    expect(markup).toContain('aria-label="Open orbit.png"');
    expect(markup).toContain('chat-attachment--strip-tile');
    expect(markup).not.toContain('aspect-ratio');
    expect(markup).not.toContain('File reference');
});

test('an image stored as octet-stream still previews when its name says image', () => {
    const markup = render([image('legacy', { mediaType: 'application/octet-stream' })], {
        legacy: [10, 10],
    });

    expect(markup).toContain('src="blob:legacy"');
});

test('an image still downloading reserves its box instead of showing a file card', () => {
    const markup = render([image('slow')], {});

    expect(markup).not.toContain('data-variant="file"');
    expect(markup).not.toContain('<img');
});

test('every image gets its own tile in one strip, with no overflow count', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const markup = render(
        ids.map((id) => image(id)),
        Object.fromEntries(ids.map((id) => [id, [100, 100] as [number, number]]))
    );

    expect(markup.match(/data-slot="message-media-strip"/gu)).toHaveLength(1);
    expect(markup.match(/data-media-strip-tile/gu)).toHaveLength(6);
    expect(markup).toContain('blob:f');
    expect(markup).not.toContain('+2');
    // The scroller is structure, not a tab stop; the tiles are.
    expect(markup).not.toMatch(/data-slot="message-media-strip"[^>]*tabindex/u);
});

test('images lead the strip, then files, each in message order', () => {
    const pdf = { filename: 'brief.pdf', mediaType: 'application/pdf' };
    const markup = render(
        [
            image('first-file', pdf),
            image('photo-one'),
            image('second-file', { ...pdf, filename: 'notes.pdf' }),
            image('photo-two'),
        ],
        { 'photo-one': [10, 10], 'photo-two': [10, 10] }
    );
    const order = [...markup.matchAll(/aria-label="(Open|Download) ([^"]+)"/gu)].map(
        (match) => match[2]
    );

    expect(order).toEqual(['photo-one.png', 'photo-two.png', 'brief.pdf', 'notes.pdf']);
});

test('non-image files render one file card with the format and size', () => {
    const markup = render(
        [
            image('brief', {
                filename: 'brief.pdf',
                mediaType: 'application/pdf',
                sizeBytes: 2_516_582,
            }),
        ],
        {}
    );

    expect(markup).toContain('data-variant="file"');
    expect(markup).toContain('PDF · 2.4 MB');
    expect(markup).toContain('aria-label="Download brief.pdf"');
});

test('a pending file is named but offers no download while its bytes upload', () => {
    const client = new QueryClient();
    const markup = renderToStaticMarkup(
        <QueryClientProvider client={client}>
            <MessageAttachments
                attachments={localAttachmentItems([
                    {
                        file: new File(['x'], 'notes.pdf'),
                        filename: 'notes.pdf',
                        id: 'nonce_1',
                        mediaType: 'application/pdf',
                        sizeBytes: 2048,
                    },
                ])}
            />
        </QueryClientProvider>
    );

    expect(markup).toContain('notes.pdf');
    expect(markup).not.toContain('Download notes.pdf');
});

test('attachment meta reads as format then size', () => {
    expect(describeAttachment({ filename: 'clip', mediaType: 'video/mp4', sizeBytes: 512 })).toBe(
        'MP4 · 512 B'
    );
    expect(
        describeAttachment({
            filename: 'blob',
            mediaType: 'application/octet-stream',
            sizeBytes: 0,
        })
    ).not.toContain('·');
});

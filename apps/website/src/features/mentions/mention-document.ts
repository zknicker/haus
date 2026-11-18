import { type Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { normalizeMentions } from './mention-text.ts';
import type { Mention } from './mention-types.ts';

export const mentionSchema = new Schema({
    marks: {},
    nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
            content: 'inline*',
            group: 'block',
            parseDOM: [{ tag: 'p' }],
            toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
        mention: {
            atom: true,
            attrs: {
                id: {},
                kind: {},
                label: {},
                metadata: { default: null },
                projection: {},
                text: {},
            },
            group: 'inline',
            inline: true,
            leafText: (node) => node.attrs.text,
            selectable: false,
            toDOM: (node) => [
                'span',
                {
                    'data-mention-id': node.attrs.id,
                    'data-mention-kind': node.attrs.kind,
                    'data-mention-label': node.attrs.label,
                    'data-mention-metadata': node.attrs.metadata
                        ? JSON.stringify(node.attrs.metadata)
                        : '',
                    'data-mention-projection': node.attrs.projection,
                    'data-mention-text': node.attrs.text,
                },
                node.attrs.text,
            ],
        },
    },
});

export function contentToDoc(content: string, mentions: readonly Mention[] = []) {
    const normalizedMentions = normalizeMentions(content, mentions);
    const paragraphs: ProseMirrorNode[] = [];
    let paragraphStart = 0;

    for (const paragraphText of content.split('\n')) {
        const paragraphEnd = paragraphStart + paragraphText.length;
        const inline: ProseMirrorNode[] = [];
        let cursor = paragraphStart;

        for (const mention of normalizedMentions) {
            if (mention.start < paragraphStart || mention.end > paragraphEnd) {
                continue;
            }

            if (mention.start > cursor) {
                inline.push(mentionSchema.text(content.slice(cursor, mention.start)));
            }
            inline.push(
                mentionSchema.nodes.mention.create({
                    id: mention.id,
                    kind: mention.kind,
                    label: mention.label,
                    metadata: mention.metadata ?? null,
                    projection: mention.projection,
                    text: mention.text,
                })
            );
            cursor = mention.end;
        }

        if (cursor < paragraphEnd) {
            inline.push(mentionSchema.text(content.slice(cursor, paragraphEnd)));
        }

        paragraphs.push(mentionSchema.nodes.paragraph.create(null, inline));
        paragraphStart = paragraphEnd + 1;
    }

    return mentionSchema.nodes.doc.create(null, paragraphs);
}

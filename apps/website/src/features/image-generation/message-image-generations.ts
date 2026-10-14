import {
    type ChatMessage,
    type ImageGeneration,
    parseHausRichReferences,
    parseImageGenerationReferenceTarget,
} from '@haus/api';

export type MessageImageSegment =
    | { key: string; kind: 'text'; text: string }
    | { generations: readonly ImageGeneration[]; key: string; kind: 'images' };

const noGenerations: readonly ImageGeneration[] = [];

/** The image generations a Message links, in link order: the Server's `imageGenerations` projection. */
export function messageImageGenerations(
    message: Pick<ChatMessage, 'imageGenerations'>
): readonly ImageGeneration[] {
    return message.imageGenerations ?? noGenerations;
}

/**
 * Cuts a Message into text and image segments so each card renders where its
 * link was written. A paragraph made only of links to generations the Server
 * recorded on this Message becomes a segment of cards, and consecutive such
 * paragraphs share one segment (one horizontal strip). Only recorded links
 * count: a link to a generation the Message does not carry stays visible
 * text, so nobody can hide prose behind made-up link syntax. A recorded
 * generation linked inline, inside a sentence or a list, has no paragraph to
 * stand in, so its card follows the last segment.
 */
export function splitImageGenerationContent(
    content: string,
    generations: readonly ImageGeneration[]
): MessageImageSegment[] {
    if (generations.length === 0) {
        return [{ key: 'text:0', kind: 'text', text: content }];
    }
    const byId = new Map(generations.map((generation) => [generation.id, generation]));
    const placed = new Set<string>();
    const segments: MessageImageSegment[] = [];
    let textStart: number | null = null;
    let textEnd = 0;
    let strip: ImageGeneration[] = [];

    const flushText = () => {
        if (textStart !== null) {
            segments.push({
                key: `text:${textStart}`,
                kind: 'text',
                text: content.slice(textStart, textEnd),
            });
            textStart = null;
        }
    };
    const flushStrip = () => {
        if (strip.length > 0) {
            segments.push({ generations: strip, key: `images:${strip[0]?.id}`, kind: 'images' });
            strip = [];
        }
    };

    for (const block of paragraphBlocks(content)) {
        const linked = backedGenerations(content.slice(block.start, block.end), byId);
        if (linked) {
            flushText();
            for (const generation of linked) {
                if (!placed.has(generation.id)) {
                    placed.add(generation.id);
                    strip.push(generation);
                }
            }
            continue;
        }
        flushStrip();
        textStart ??= block.start;
        textEnd = block.end;
    }
    flushText();
    flushStrip();

    const unplaced = generations.filter((generation) => !placed.has(generation.id));
    if (unplaced.length > 0) {
        segments.push({ generations: unplaced, key: `images:${unplaced[0]?.id}`, kind: 'images' });
    }
    return segments.length > 0 ? segments : [{ key: 'text:0', kind: 'text', text: content }];
}

/** The generations a paragraph links when it is nothing but backed links; null otherwise. */
function backedGenerations(
    paragraph: string,
    byId: ReadonlyMap<string, ImageGeneration>
): ImageGeneration[] | null {
    const references = parseHausRichReferences(paragraph);
    if (references.length === 0) {
        return null;
    }
    const linked: ImageGeneration[] = [];
    let rest = paragraph;
    for (const reference of references) {
        const id =
            reference.kind === 'image-generation'
                ? parseImageGenerationReferenceTarget(reference.id)
                : null;
        const generation = id ? byId.get(id) : undefined;
        if (!generation) {
            return null;
        }
        linked.push(generation);
        rest = rest.replace(reference.text, '');
    }
    return rest.trim().length === 0 ? linked : null;
}

interface Block {
    end: number;
    start: number;
}

/**
 * Blank-line paragraphs of non-empty text, as ranges of `content`. A fenced
 * code block is one paragraph however many blank lines it holds.
 */
function paragraphBlocks(content: string): Block[] {
    const blocks: Block[] = [];
    let blockStart: number | null = null;
    let blockEnd = 0;
    let fence: string | null = null;
    let offset = 0;

    for (const line of content.split('\n')) {
        const lineEnd = offset + line.length;
        const marker = /^[ \t]*(`{3,}|~{3,})/u.exec(line)?.[1];
        if (fence === null && marker) {
            fence = marker[0] ?? null;
        } else if (fence !== null && marker?.startsWith(fence)) {
            fence = null;
        }
        if (line.trim().length === 0 && fence === null) {
            if (blockStart !== null) {
                blocks.push({ end: blockEnd, start: blockStart });
                blockStart = null;
            }
        } else {
            blockStart ??= offset;
            blockEnd = lineEnd;
        }
        offset = lineEnd + 1;
    }
    if (blockStart !== null) {
        blocks.push({ end: blockEnd, start: blockStart });
    }
    return blocks;
}

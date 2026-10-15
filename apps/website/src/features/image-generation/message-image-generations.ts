import {
    type ChatMessage,
    type HausRichReference,
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
 * link was written, line by line:
 *
 * - A line made only of links to generations the Server recorded on this
 *   Message becomes a strip of cards in its place.
 * - Links that end a line ("Left to right: [img] [img]") leave the line's
 *   text in place and become a strip right below it.
 * - A link inside a sentence keeps its chip, and its card follows the
 *   paragraph it is in.
 *
 * Strips with only blank lines between them merge into one. Only recorded
 * links count: a link to a generation the Message does not carry stays
 * visible text, so nobody can hide prose behind made-up link syntax. A
 * recorded generation with no link in the text follows the last segment.
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
    let text: string[] = [];
    let textKey = 0;
    let afterParagraph: ImageGeneration[] = [];

    const addText = (line: string, offset: number) => {
        if (text.length === 0) {
            textKey = offset;
        }
        text.push(line);
    };
    const flushText = () => {
        // Blank lines at a segment's edges only spaced it from a strip; the column gap does that now.
        const joined = text.join('\n').replace(/^\s*\n|\n\s*$/gu, '');
        if (joined.trim().length > 0) {
            segments.push({ key: `text:${textKey}`, kind: 'text', text: joined });
        }
        text = [];
    };
    const addImages = (linked: readonly ImageGeneration[]) => {
        const fresh = linked.filter((generation) => !placed.has(generation.id));
        if (fresh.length === 0) {
            return;
        }
        for (const generation of fresh) {
            placed.add(generation.id);
        }
        flushText();
        const last = segments.at(-1);
        if (last?.kind === 'images') {
            segments[segments.length - 1] = {
                ...last,
                generations: [...last.generations, ...fresh],
            };
        } else {
            segments.push({ generations: fresh, key: `images:${fresh[0]?.id}`, kind: 'images' });
        }
    };
    const endParagraph = () => {
        addImages(afterParagraph);
        afterParagraph = [];
    };

    for (const line of contentLines(content)) {
        const blank = line.text.trim().length === 0;
        if (line.fenced || blank) {
            if (blank && !line.fenced) {
                endParagraph();
            }
            addText(line.text, line.offset);
            continue;
        }
        const linked = lineImageLinks(line.text, byId);
        if (linked.kind === 'text') {
            addText(line.text, line.offset);
        } else if (linked.kind === 'inline') {
            addText(line.text, line.offset);
            afterParagraph.push(...linked.generations);
        } else {
            if (linked.lead.length > 0) {
                addText(linked.lead, line.offset);
            }
            addImages(linked.generations);
        }
    }
    endParagraph();
    flushText();

    addImages(generations);
    return segments.length > 0 ? segments : [{ key: 'text:0', kind: 'text', text: content }];
}

type LineImageLinks =
    | { kind: 'text' }
    | { generations: ImageGeneration[]; kind: 'inline' }
    | { generations: ImageGeneration[]; kind: 'trailing'; lead: string };

/**
 * How a line links recorded generations: not at all, inside its sentence, or
 * as a trailing run of links with `lead` the text before it (empty, or a bare
 * list or quote marker, when the line is nothing but links).
 */
function lineImageLinks(line: string, byId: ReadonlyMap<string, ImageGeneration>): LineImageLinks {
    const backed = parseHausRichReferences(line).flatMap((reference) => {
        const generation = recordedGeneration(reference, byId);
        return generation ? [{ generation, reference }] : [];
    });
    if (backed.length === 0) {
        return { kind: 'text' };
    }
    // Walk back from the line's end over backed links and the space between them.
    let runStart = line.trimEnd().length;
    let index = backed.length - 1;
    while (index >= 0) {
        const entry = backed[index];
        if (!entry || line.slice(entry.reference.end, runStart).trim().length > 0) {
            break;
        }
        runStart = entry.reference.start;
        index -= 1;
    }
    const trailing = backed.slice(index + 1);
    if (trailing.length === 0) {
        return { generations: backed.map((entry) => entry.generation), kind: 'inline' };
    }
    const lead = line.slice(0, runStart).trimEnd();
    if (index >= 0) {
        // Links earlier in the sentence stay chips; their cards join the strip below.
        return {
            generations: backed.map((entry) => entry.generation),
            kind: 'trailing',
            lead,
        };
    }
    return {
        generations: trailing.map((entry) => entry.generation),
        kind: 'trailing',
        lead: bareMarker.test(lead) ? '' : lead,
    };
}

/** A line prefix that is only list or quote syntax, which means nothing once its links move out. */
const bareMarker = /^\s*(?:[-*+>]|\d+[.)])?\s*$/u;

function recordedGeneration(
    reference: HausRichReference,
    byId: ReadonlyMap<string, ImageGeneration>
): ImageGeneration | null {
    if (reference.kind !== 'image-generation') {
        return null;
    }
    const id = parseImageGenerationReferenceTarget(reference.id);
    return (id ? byId.get(id) : undefined) ?? null;
}

interface ContentLine {
    /** Inside a fenced code block, where links are code rather than card positions. */
    fenced: boolean;
    offset: number;
    text: string;
}

function contentLines(content: string): ContentLine[] {
    const lines: ContentLine[] = [];
    let fence: string | null = null;
    let offset = 0;
    for (const text of content.split('\n')) {
        const marker = /^[ \t]*(`{3,}|~{3,})/u.exec(text)?.[1];
        let fenced = fence !== null;
        if (fence === null && marker) {
            fence = marker;
            fenced = true;
        } else if (fence !== null && marker?.startsWith(fence)) {
            fence = null;
        }
        lines.push({ fenced, offset, text });
        offset += text.length + 1;
    }
    return lines;
}

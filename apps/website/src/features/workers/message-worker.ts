import {
    type ChatMessage,
    type Worker,
    parseWorkerReferenceTarget,
    parseHausRichReferences,
} from '@haus/api';

/**
 * The Worker a Message links, in link order (ADR 0044): the Server's
 * `worker` annotation.
 */
export function messageWorker(message: Pick<ChatMessage, 'worker'>): readonly Worker[] {
    return message.worker ?? noWork;
}

/**
 * The Message text as the transcript shows it. Its card states each linked
 * work in full, so a final paragraph made only of links to that work would say
 * it twice and is left out. Only links the Server recorded on this Message
 * count (ADR 0044, Q1): a link to work the Message does not carry — forged,
 * unknown, or written before links were recorded — keeps the whole paragraph
 * visible, so nobody can hide text behind made-up link syntax.
 */
export function workerDisplayContent(
    content: string,
    works: readonly Pick<Worker, 'id'>[]
): string {
    if (works.length === 0) {
        return content;
    }
    const trimmed = content.trimEnd();
    const paragraphStart = lastParagraphStart(trimmed);
    const paragraph = trimmed.slice(paragraphStart);
    return isBackedLinkOnlyParagraph(paragraph, new Set(works.map((work) => work.id)))
        ? trimmed.slice(0, paragraphStart).trimEnd()
        : content;
}

const noWork: readonly Worker[] = [];
const paragraphBreak = /\n[ \t]*\n/gu;

function lastParagraphStart(content: string): number {
    let start = 0;
    for (const match of content.matchAll(paragraphBreak)) {
        start = match.index + match[0].length;
    }
    return start;
}

function isBackedLinkOnlyParagraph(paragraph: string, backed: ReadonlySet<string>): boolean {
    const references = parseHausRichReferences(paragraph);
    if (references.length === 0) {
        return false;
    }
    let rest = paragraph;
    for (const reference of references) {
        const workId =
            reference.kind === 'worker' ? parseWorkerReferenceTarget(reference.id) : null;
        if (!(workId && backed.has(workId))) {
            return false;
        }
        rest = rest.replace(reference.text, '');
    }
    return rest.trim().length === 0;
}

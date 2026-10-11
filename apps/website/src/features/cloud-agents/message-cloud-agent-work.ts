import {
    type ChatMessage,
    type CloudAgentWork,
    parseCloudAgentWorkReferenceTarget,
    parseHausRichReferences,
} from '@haus/api';

/**
 * The Cloud Agent work a Message links, in link order (ADR 0044): the Server's
 * `cloudAgentWork` annotation. A Message still carrying the retired
 * `cloud-agent-work` body shows that work too, first, until the contraction
 * slice rewrites every such Message to a link.
 */
export function messageCloudAgentWork(
    message: Pick<ChatMessage, 'body' | 'cloudAgentWork'>
): readonly CloudAgentWork[] {
    const linked = message.cloudAgentWork ?? noWork;
    if (message.body.kind !== 'cloud-agent-work') {
        return linked;
    }
    const embedded = message.body.work;
    return linked.some((work) => work.id === embedded.id) ? linked : [embedded, ...linked];
}

/**
 * The Message text as the transcript shows it. Its card states each linked
 * work in full, so a final paragraph made only of links to that work would say
 * it twice and is left out. Only links the Server recorded on this Message
 * count (ADR 0044, Q1): a link to work the Message does not carry — forged,
 * unknown, or written before links were recorded — keeps the whole paragraph
 * visible, so nobody can hide text behind made-up link syntax.
 */
export function cloudAgentWorkDisplayContent(
    content: string,
    works: readonly Pick<CloudAgentWork, 'id'>[]
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

const noWork: readonly CloudAgentWork[] = [];
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
            reference.kind === 'cloud-agent-work'
                ? parseCloudAgentWorkReferenceTarget(reference.id)
                : null;
        if (!(workId && backed.has(workId))) {
            return false;
        }
        rest = rest.replace(reference.text, '');
    }
    return rest.trim().length === 0;
}

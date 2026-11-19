import { formatWorkerReferenceTarget } from './rich-references.ts';
import { workerTitleMaxLength } from './worker-shared.ts';

const targetPrefixLength = formatWorkerReferenceTarget('').length;

/** The most text an author may write into one Message. */
export const chatMessageAuthoredContentMaxLength = 32_000;

/** The label a Worker link carries when its title sanitizes to nothing. */
export const workerLinkFallbackLabel = 'Worker';

/** Server-minted work ids are short; the bound keeps the generated suffix bounded. */
export const workerLinkIdMaxLength = 64;

/**
 * The longest text the Server appends to authored content: the `\n\n`
 * separator plus one link. A label keeps at most `workerTitleMaxLength`
 * code points, each at most two UTF-16 units once surrogates or escapes count.
 */
export const workerLinkSuffixMaxLength =
    '\n\n'.length +
    '[]()'.length +
    workerTitleMaxLength * 2 +
    targetPrefixLength +
    workerLinkIdMaxLength;

/** The cap on stored and served `ChatMessage.content`: authored text plus one Server-trusted link. */
export const chatMessageContentMaxLength =
    chatMessageAuthoredContentMaxLength + workerLinkSuffixMaxLength;

/**
 * The one way to write a Worker link: `[<label>](worker://<workerId>)`.
 * The label is the work title made safe for the link grammar: line breaks
 * become spaces, `]` is dropped, `\` and `[` are escaped, and a title with
 * nothing left reads as `workerLinkFallbackLabel`. The migration's SQL
 * mirrors this rule; change both together.
 */
export function formatWorkerLink(title: string, workerId: string): string {
    const target = formatWorkerReferenceTarget(workerId);
    const encodedIdLength = target.length - targetPrefixLength;
    if (encodedIdLength < 1 || encodedIdLength > workerLinkIdMaxLength) {
        throw new Error('A Worker link needs an encoded work id of 1–64 characters.');
    }
    return `[${workerLinkLabel(title)}](${target})`;
}

/** The escaped label `formatWorkerLink` writes; parsing it back yields the unescaped title. */
export function workerLinkLabel(title: string): string {
    const plain = title
        .replace(/[\r\n]+/gu, ' ')
        .replaceAll(']', '')
        .trim();
    const clipped = Array.from(plain).slice(0, workerTitleMaxLength).join('').trim();
    if (!clipped) {
        return workerLinkFallbackLabel;
    }
    return clipped.replace(/[\\[]/gu, (character) => `\\${character}`);
}

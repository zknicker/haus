import { cloudAgentTitleMaxLength } from './cloud-agent-shared.ts';
import { formatCloudAgentWorkReferenceTarget } from './rich-references.ts';

const targetPrefixLength = formatCloudAgentWorkReferenceTarget('').length;

/** The most text an author may write into one Message. */
export const chatMessageAuthoredContentMaxLength = 32_000;

/** The label a Cloud Agent work link carries when its title sanitizes to nothing. */
export const cloudAgentWorkLinkFallbackLabel = 'Cloud Agent work';

/** Server-minted work ids are short; the bound keeps the generated suffix bounded. */
export const cloudAgentWorkLinkIdMaxLength = 64;

/**
 * The longest text the Server appends to authored content: the `\n\n`
 * separator plus one link. A label keeps at most `cloudAgentTitleMaxLength`
 * code points, each at most two UTF-16 units once surrogates or escapes count.
 */
export const cloudAgentWorkLinkSuffixMaxLength =
    '\n\n'.length +
    '[]()'.length +
    cloudAgentTitleMaxLength * 2 +
    targetPrefixLength +
    cloudAgentWorkLinkIdMaxLength;

/** The cap on stored and served `ChatMessage.content`: authored text plus one Server-trusted link. */
export const chatMessageContentMaxLength =
    chatMessageAuthoredContentMaxLength + cloudAgentWorkLinkSuffixMaxLength;

/**
 * The one way to write a Cloud Agent work link: `[<label>](cloud-agent://<workId>)`.
 * The label is the work title made safe for the link grammar: line breaks
 * become spaces, `]` is dropped, `\` and `[` are escaped, and a title with
 * nothing left reads as `cloudAgentWorkLinkFallbackLabel`. The migration's SQL
 * mirrors this rule; change both together.
 */
export function formatCloudAgentWorkLink(title: string, workId: string): string {
    const target = formatCloudAgentWorkReferenceTarget(workId);
    const encodedIdLength = target.length - targetPrefixLength;
    if (encodedIdLength < 1 || encodedIdLength > cloudAgentWorkLinkIdMaxLength) {
        throw new Error('A Cloud Agent work link needs an encoded work id of 1–64 characters.');
    }
    return `[${cloudAgentWorkLinkLabel(title)}](${target})`;
}

/** The escaped label `formatCloudAgentWorkLink` writes; parsing it back yields the unescaped title. */
export function cloudAgentWorkLinkLabel(title: string): string {
    const plain = title
        .replace(/[\r\n]+/gu, ' ')
        .replaceAll(']', '')
        .trim();
    const clipped = Array.from(plain).slice(0, cloudAgentTitleMaxLength).join('').trim();
    if (!clipped) {
        return cloudAgentWorkLinkFallbackLabel;
    }
    return clipped.replace(/[\\[]/gu, (character) => `\\${character}`);
}

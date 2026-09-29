import { needsYouPreviewMaxLength, parseHausRichReferences } from '@haus/api';

/**
 * A Needs you row's plain-text excerpt: rich references read as their sigiled
 * label (`@Ada`, `#product`), whitespace collapses to single spaces, and the
 * result is cut to the contract's preview budget with an ellipsis.
 */
export function needsYouPreview(content: string): string {
    let plain = '';
    let cursor = 0;
    for (const reference of parseHausRichReferences(content)) {
        plain += content.slice(cursor, reference.start) + referenceText(reference);
        cursor = reference.end;
    }
    plain = (plain + content.slice(cursor)).replace(/\s+/gu, ' ').trim();
    if (plain.length <= needsYouPreviewMaxLength) {
        return plain;
    }
    let end = 0;
    for (const character of plain) {
        if (end + character.length >= needsYouPreviewMaxLength) {
            break;
        }
        end += character.length;
    }
    return `${plain.slice(0, end)}…`;
}

function referenceText(reference: { kind: string; label: string }) {
    if (reference.kind === 'agent' || reference.kind === 'user') {
        return `@${reference.label}`;
    }
    return reference.kind === 'chat' ? `#${reference.label}` : reference.label;
}

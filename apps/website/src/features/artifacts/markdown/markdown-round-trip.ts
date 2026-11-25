import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { parseMarkdownDocument } from './markdown-parse.ts';
import { serializeMarkdownDocument } from './markdown-serialize.ts';

export function losslessMarkdownDocument(text: string) {
    if (text.includes('\r')) {
        return null;
    }
    const doc = parseMarkdownDocument(text);
    if (!doc) {
        return null;
    }
    return serializeMarkdownDocument(doc) === withoutTrailingNewlines(text) ? doc : null;
}

export function markdownFileText(doc: ProseMirrorNode, original: string) {
    const ending = /\n*$/u.exec(original)?.[0] ?? '';
    return serializeMarkdownDocument(doc) + ending;
}

function withoutTrailingNewlines(text: string) {
    return text.replace(/\n+$/u, '');
}

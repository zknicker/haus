import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import { escapeMarkdownText } from './markdown-escape.ts';

export function serializeMarkdownDocument(doc: ProseMirrorNode) {
    return blocks(doc, '\n\n');
}

function blocks(parent: ProseMirrorNode, separator: string) {
    const parts: string[] = [];
    parent.forEach((child) => {
        parts.push(block(child));
    });
    return parts.join(separator);
}

function block(node: ProseMirrorNode) {
    switch (node.type.name) {
        case 'heading':
            return `${'#'.repeat(node.attrs.level)} ${inline(node)}`;
        case 'blockquote':
            return prefixLines(blocks(node, '\n\n'), '> ', '>');
        case 'code_block': {
            const fence = String(node.attrs.fence);
            return `${fence}${node.attrs.lang}\n${node.textContent}${node.textContent ? '\n' : ''}${fence}`;
        }
        case 'horizontal_rule':
            return String(node.attrs.markup);
        case 'bullet_list':
        case 'ordered_list':
            return list(node);
        default:
            return inline(node);
    }
}

function list(node: ProseMirrorNode) {
    const ordered = node.type.name === 'ordered_list';
    const separator = node.attrs.tight ? '\n' : '\n\n';
    const items: string[] = [];
    node.forEach((item, _offset, index) => {
        const marker = ordered
            ? `${Number(node.attrs.start) + index}${node.attrs.delimiter} `
            : `${node.attrs.marker} `;
        const body = blocks(item, separator);
        const indent = ' '.repeat(marker.length);
        items.push(
            body ? marker + prefixLines(body, indent, '').slice(indent.length) : marker.trimEnd()
        );
    });
    return items.join(separator);
}

function prefixLines(text: string, prefix: string, blankPrefix: string) {
    return text
        .split('\n')
        .map((line) => (line.length > 0 ? prefix + line : blankPrefix))
        .join('\n');
}

function inline(node: ProseMirrorNode) {
    let out = '';
    let active: readonly Mark[] = [];
    let atLineStart = true;
    node.forEach((child) => {
        const marks = child.isText ? child.marks : [];
        const keep = commonPrefix(active, marks);
        if (keep < active.length) {
            const trailing = /\s+$/u.exec(out)?.[0] ?? '';
            out = out.slice(0, out.length - trailing.length);
            out += active.slice(keep).reverse().map(closing).join('') + trailing;
            active = active.slice(0, keep);
        }
        if (child.type.name === 'hard_break') {
            out += String(child.attrs.markup);
            atLineStart = true;
            return;
        }
        let text = child.text ?? '';
        if (keep < marks.length) {
            const leading = /^\s+/u.exec(text)?.[0] ?? '';
            out += leading;
            text = text.slice(leading.length);
            out += marks.slice(keep).map(opening).join('');
            active = marks;
        }
        out += marks.some((mark) => mark.type.name === 'code')
            ? text
            : escapeMarkdownText(text, atLineStart);
        atLineStart = text.endsWith('\n');
    });
    return out + [...active].reverse().map(closing).join('');
}

function commonPrefix(a: readonly Mark[], b: readonly Mark[]) {
    let index = 0;
    while (index < a.length && index < b.length && a[index]?.eq(b[index] as Mark)) {
        index += 1;
    }
    return index;
}

function opening(mark: Mark) {
    switch (mark.type.name) {
        case 'link':
            return mark.attrs.style === 'inline' ? '[' : mark.attrs.style === 'angle' ? '<' : '';
        case 'code':
            return '`';
        default:
            return String(mark.attrs.markup);
    }
}

function closing(mark: Mark) {
    switch (mark.type.name) {
        case 'link': {
            if (mark.attrs.style === 'angle') {
                return '>';
            }
            if (mark.attrs.style === 'autolink') {
                return '';
            }
            const title = mark.attrs.title ? ` "${String(mark.attrs.title)}"` : '';
            return `](${String(mark.attrs.href)}${title})`;
        }
        case 'code':
            return '`';
        default:
            return String(mark.attrs.markup);
    }
}

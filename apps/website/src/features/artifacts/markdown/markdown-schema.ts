import { Schema } from 'prosemirror-model';

export const markdownSchema = new Schema({
    marks: {
        link: {
            attrs: { href: {}, style: { default: 'inline' }, title: { default: null } },
            inclusive: false,
            parseDOM: [{ tag: 'a[href]' }],
            toDOM: (mark) => [
                'a',
                { href: mark.attrs.href, rel: 'noreferrer', title: mark.attrs.title },
                0,
            ],
        },
        strong: {
            attrs: { markup: { default: '**' } },
            parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
            toDOM: () => ['strong', 0],
        },
        em: {
            attrs: { markup: { default: '*' } },
            parseDOM: [{ tag: 'em' }, { tag: 'i' }],
            toDOM: () => ['em', 0],
        },
        strike: {
            attrs: { markup: { default: '~~' } },
            parseDOM: [{ tag: 's' }, { tag: 'del' }],
            toDOM: () => ['s', 0],
        },
        code: {
            excludes: '_',
            parseDOM: [{ tag: 'code' }],
            toDOM: () => ['code', 0],
        },
    },
    nodes: {
        doc: { content: 'block+' },
        paragraph: {
            content: 'inline*',
            group: 'block',
            parseDOM: [{ tag: 'p' }],
            toDOM: () => ['p', 0],
        },
        heading: {
            attrs: { level: { default: 1 } },
            content: 'inline*',
            defining: true,
            group: 'block',
            parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ attrs: { level }, tag: `h${level}` })),
            toDOM: (node) => [`h${node.attrs.level}`, 0],
        },
        blockquote: {
            content: 'block+',
            defining: true,
            group: 'block',
            parseDOM: [{ tag: 'blockquote' }],
            toDOM: () => ['blockquote', 0],
        },
        code_block: {
            attrs: { fence: { default: '```' }, lang: { default: '' } },
            code: true,
            content: 'text*',
            defining: true,
            group: 'block',
            marks: '',
            parseDOM: [{ preserveWhitespace: 'full', tag: 'pre' }],
            toDOM: () => ['pre', ['code', 0]],
        },
        horizontal_rule: {
            attrs: { markup: { default: '---' } },
            group: 'block',
            parseDOM: [{ tag: 'hr' }],
            toDOM: () => ['hr'],
        },
        bullet_list: {
            attrs: { marker: { default: '-' }, tight: { default: true } },
            content: 'list_item+',
            group: 'block',
            parseDOM: [{ tag: 'ul' }],
            toDOM: () => ['ul', 0],
        },
        ordered_list: {
            attrs: { delimiter: { default: '.' }, start: { default: 1 }, tight: { default: true } },
            content: 'list_item+',
            group: 'block',
            parseDOM: [{ tag: 'ol' }],
            toDOM: (node) => ['ol', { start: node.attrs.start === 1 ? null : node.attrs.start }, 0],
        },
        list_item: {
            content: 'paragraph block*',
            defining: true,
            parseDOM: [{ tag: 'li' }],
            toDOM: () => ['li', 0],
        },
        text: { group: 'inline' },
        hard_break: {
            attrs: { markup: { default: '\\\n' } },
            group: 'inline',
            inline: true,
            parseDOM: [{ tag: 'br' }],
            selectable: false,
            toDOM: () => ['br'],
        },
    },
});

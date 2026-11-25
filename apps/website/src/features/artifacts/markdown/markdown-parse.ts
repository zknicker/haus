import { Lexer, type Token, type Tokens } from 'marked';
import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import { markdownSchema } from './markdown-schema.ts';

export function parseMarkdownDocument(text: string) {
    const blocks = parseBlocks(new Lexer({ gfm: true }).lex(text));
    if (!blocks) {
        return null;
    }
    return markdownSchema.node(
        'doc',
        null,
        blocks.length > 0 ? blocks : [markdownSchema.node('paragraph')]
    );
}

const schema = markdownSchema;
const entityPattern = /&(#\d+|#x[\da-f]+|[a-z][\da-z]*);/iu;

function parseBlocks(tokens: readonly Token[]) {
    const nodes: ProseMirrorNode[] = [];
    for (const token of tokens) {
        if (token.type === 'space') {
            continue;
        }
        const node = parseBlock(token);
        if (!node) {
            return null;
        }
        nodes.push(node);
    }
    return nodes;
}

function parseBlock(token: Token) {
    switch (token.type) {
        case 'heading':
            return token.raw.trimStart().startsWith('#')
                ? withInline('heading', { level: token.depth }, token.tokens ?? [])
                : null;
        case 'paragraph':
        case 'text':
            return withInline('paragraph', null, token.tokens ?? [textToken(token.raw)]);
        case 'blockquote': {
            const children = parseBlocks(token.tokens ?? []);
            return children && children.length > 0
                ? schema.node('blockquote', null, children)
                : null;
        }
        case 'code':
            return parseCode(token as Tokens.Code);
        case 'hr':
            return schema.node('horizontal_rule', { markup: token.raw.trim() });
        case 'list':
            return parseList(token as Tokens.List);
        default:
            return null;
    }
}

function parseCode(token: Tokens.Code) {
    const fence = /^(`{3,}|~{3,})/u.exec(token.raw)?.[1];
    if (token.codeBlockStyle === 'indented' || !fence) {
        return null;
    }
    const content = token.text.length > 0 ? [schema.text(token.text)] : [];
    return schema.node('code_block', { fence, lang: token.lang ?? '' }, content);
}

function parseList(token: Tokens.List) {
    const items: ProseMirrorNode[] = [];
    for (const item of token.items) {
        if (item.task) {
            return null;
        }
        const children = parseBlocks(item.tokens);
        if (!children || children[0]?.type !== schema.nodes.paragraph) {
            return null;
        }
        items.push(schema.node('list_item', null, children));
    }
    const first = token.items[0]?.raw.trimStart() ?? '';
    if (token.ordered) {
        const delimiter = /^\d+([.)])/u.exec(first)?.[1] ?? '.';
        const start = typeof token.start === 'number' ? token.start : 1;
        return schema.node('ordered_list', { delimiter, start, tight: !token.loose }, items);
    }
    return schema.node('bullet_list', { marker: first[0] ?? '-', tight: !token.loose }, items);
}

function withInline(type: string, attrs: Record<string, unknown> | null, tokens: Token[]) {
    const content = parseInline(tokens, []);
    return content ? schema.node(type, attrs, content) : null;
}

function parseInline(tokens: readonly Token[], marks: readonly Mark[]) {
    const nodes: ProseMirrorNode[] = [];
    for (const token of tokens) {
        const parsed = parseInlineToken(token, marks);
        if (!parsed) {
            return null;
        }
        nodes.push(...parsed);
    }
    return nodes;
}

function parseInlineToken(token: Token, marks: readonly Mark[]) {
    switch (token.type) {
        case 'text':
            if (token.tokens) {
                return parseInline(token.tokens, marks);
            }
            return entityPattern.test(token.text) ? null : textNodes(token.text, marks);
        case 'escape':
            return textNodes(token.text, marks);
        case 'codespan':
            return entityPattern.test(token.text)
                ? null
                : textNodes(token.text, [...marks, schema.marks.code.create()]);
        case 'strong':
            return nested(
                token,
                marks,
                schema.marks.strong.create({ markup: token.raw.slice(0, 2) })
            );
        case 'em':
            return nested(token, marks, schema.marks.em.create({ markup: token.raw[0] }));
        case 'del':
            return nested(
                token,
                marks,
                schema.marks.strike.create({ markup: delMarkup(token.raw) })
            );
        case 'link':
            return parseLink(token as Tokens.Link, marks);
        case 'br':
            return [schema.node('hard_break', { markup: token.raw })];
        default:
            return null;
    }
}

function parseLink(token: Tokens.Link, marks: readonly Mark[]) {
    const style = token.raw.startsWith('<')
        ? 'angle'
        : token.raw.startsWith('[')
          ? 'inline'
          : 'autolink';
    const link = schema.marks.link.create({
        href: token.href,
        style,
        title: token.title ?? null,
    });
    return nested(token, marks, link);
}

function nested(token: Token, marks: readonly Mark[], mark: Mark) {
    return 'tokens' in token && token.tokens ? parseInline(token.tokens, [...marks, mark]) : null;
}

function textNodes(text: string, marks: readonly Mark[]) {
    return text.length > 0 ? [schema.text(text, marks)] : [];
}

function delMarkup(raw: string) {
    return raw.startsWith('~~') ? '~~' : '~';
}

function textToken(raw: string) {
    const token: Tokens.Text = { raw, text: raw, type: 'text' };
    return token;
}

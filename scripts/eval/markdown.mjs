// A deliberately small Markdown renderer for `--notes`: headings, paragraphs,
// ordered and unordered lists, inline code, bold, italic, and links. Text is
// escaped first, so a notes file can never inject markup into the report.

export function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

export function renderMarkdown(source) {
    const blocks = [];
    let list = null;
    let paragraph = [];
    const flushParagraph = () => {
        if (paragraph.length > 0) {
            blocks.push(`<p>${inline(paragraph.join(' '))}</p>`);
            paragraph = [];
        }
    };
    const flushList = () => {
        if (list) {
            blocks.push(
                `<${list.tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${list.tag}>`
            );
            list = null;
        }
    };
    for (const raw of String(source).split('\n')) {
        const line = raw.trimEnd();
        const heading = line.match(/^(#{1,4})\s+(.*)$/u);
        const item = line.match(/^\s*(?:([-*])|(\d+)[.)])\s+(.*)$/u);
        if (line.trim() === '') {
            flushParagraph();
            flushList();
        } else if (heading) {
            flushParagraph();
            flushList();
            // The report owns h1/h2; notes headings start at h3.
            const level = Math.min(heading[1].length + 2, 4);
            blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        } else if (item) {
            flushParagraph();
            const tag = item[1] ? 'ul' : 'ol';
            if (list?.tag !== tag) {
                flushList();
                list = { items: [], tag };
            }
            list.items.push(item[3]);
        } else if (list && /^\s+\S/u.test(raw)) {
            list.items[list.items.length - 1] += ` ${line.trim()}`;
        } else {
            flushList();
            paragraph.push(line.trim());
        }
    }
    flushParagraph();
    flushList();
    return blocks.join('\n');
}

function inline(text) {
    return escapeHtml(text)
        .replace(/`([^`]+)`/gu, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>')
        .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/gu, '$1<em>$2</em>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gu, '<a href="$2">$1</a>');
}

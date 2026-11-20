import TurndownService from 'turndown';

export const modelTextLimits = { maxBytes: 50 * 1024, maxLines: 2000 } as const;

export function contentKind(contentType: string | null) {
    const { essence } = parseContentType(contentType);
    if (essence === 'text/html' || essence === 'application/xhtml+xml') {
        return 'html';
    }
    if (
        essence.startsWith('text/') ||
        textTypes.has(essence) ||
        essence.endsWith('+json') ||
        essence.endsWith('+xml')
    ) {
        return 'text';
    }
    return essence === '' ? 'unknown' : 'binary';
}

export function pageText(input: { bytes: Uint8Array; contentType: string | null; url: string }) {
    const kind = contentKind(input.contentType);
    if (kind === 'binary' || (kind === 'unknown' && input.bytes.subarray(0, 1024).includes(0))) {
        return null;
    }
    const text = decode(input.bytes, parseContentType(input.contentType).charset);
    return kind === 'html' ? htmlToMarkdown(text, input.url) : text;
}

export function truncateForModel(text: string) {
    const lines = text.split('\n');
    const kept: string[] = [];
    let bytes = 0;
    for (const line of lines) {
        const size = Buffer.byteLength(line) + (kept.length > 0 ? 1 : 0);
        if (kept.length === modelTextLimits.maxLines || bytes + size > modelTextLimits.maxBytes) {
            break;
        }
        kept.push(line);
        bytes += size;
    }
    if (kept.length === lines.length) {
        return text;
    }
    if (kept.length === 0) {
        const head = new TextDecoder().decode(
            Buffer.from(text).subarray(0, modelTextLimits.maxBytes)
        );
        return `${head}\n\n[Cut at 50 KiB of ${formatSize(Buffer.byteLength(text))}; the rest was not shown.]`;
    }
    const limit =
        kept.length === modelTextLimits.maxLines ? 'the 2,000-line limit' : 'the 50 KiB limit';
    return `${kept.join('\n')}\n\n[Showed lines 1-${kept.length} of ${lines.length}; cut at ${limit}.]`;
}

export function formatSize(bytes: number) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KiB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function htmlToMarkdown(html: string, url: string) {
    const service = new TurndownService({ codeBlockStyle: 'fenced', headingStyle: 'atx' });
    service.remove((node) => removedElements.has(node.nodeName.toLowerCase()));
    service.addRule('absolute-links', {
        filter: (node) => node.nodeName === 'A' && node.getAttribute('href') !== null,
        replacement: (content, node) => {
            const href: string = node.getAttribute('href') ?? '';
            const absolute = URL.parse(href, url)?.href ?? href;
            return content.trim() === '' ? '' : `[${content}](${absolute})`;
        },
    });
    return service.turndown(html).trim();
}

function parseContentType(contentType: string | null) {
    const [essence = '', ...parameters] = (contentType ?? '').split(';');
    const charset = parameters
        .map((parameter) => parameter.trim().match(/^charset="?([^"]+)"?$/iu)?.[1])
        .find((value) => value !== undefined);
    return { charset: charset ?? 'utf-8', essence: essence.trim().toLowerCase() };
}

const removedElements = new Set(['noscript', 'script', 'style', 'svg', 'template']);

const textTypes = new Set([
    'application/javascript',
    'application/json',
    'application/x-ndjson',
    'application/xml',
]);

function decode(bytes: Uint8Array, charset: string) {
    try {
        return new TextDecoder(charset as ConstructorParameters<typeof TextDecoder>[0]).decode(
            bytes
        );
    } catch {
        return new TextDecoder().decode(bytes);
    }
}

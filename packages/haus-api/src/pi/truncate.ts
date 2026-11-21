export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_BYTES = 50 * 1024;
export const GREP_MAX_LINE_LENGTH = 500;

export interface TruncationResult {
    content: string;
    firstLineExceedsLimit: boolean;
    lastLinePartial: boolean;
    maxBytes: number;
    maxLines: number;
    outputBytes: number;
    outputLines: number;
    totalBytes: number;
    totalLines: number;
    truncated: boolean;
    truncatedBy: 'lines' | 'bytes' | null;
}

export interface TruncationOptions {
    maxBytes?: number;
    maxLines?: number;
}

export function formatSize(bytes: number) {
    if (bytes < 1024) {
        return `${bytes}B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)}KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function truncateHead(content: string, options: TruncationOptions = {}) {
    const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const totalBytes = Buffer.byteLength(content, 'utf-8');
    const lines = splitLinesForCounting(content);
    const totalLines = lines.length;
    const limits = { maxBytes, maxLines, totalBytes, totalLines };

    if (totalLines <= maxLines && totalBytes <= maxBytes) {
        return untruncated(content, limits);
    }

    if (Buffer.byteLength(lines[0] ?? '', 'utf-8') > maxBytes) {
        return {
            ...limits,
            content: '',
            firstLineExceedsLimit: true,
            lastLinePartial: false,
            outputBytes: 0,
            outputLines: 0,
            truncated: true,
            truncatedBy: 'bytes',
        };
    }

    const kept: string[] = [];
    let keptBytes = 0;
    let truncatedBy: 'lines' | 'bytes' = 'lines';
    for (let index = 0; index < lines.length && index < maxLines; index++) {
        const line = lines[index] ?? '';
        const lineBytes = Buffer.byteLength(line, 'utf-8') + (index > 0 ? 1 : 0);
        if (keptBytes + lineBytes > maxBytes) {
            truncatedBy = 'bytes';
            break;
        }
        kept.push(line);
        keptBytes += lineBytes;
    }
    if (kept.length >= maxLines && keptBytes <= maxBytes) {
        truncatedBy = 'lines';
    }

    const output = kept.join('\n');
    return {
        ...limits,
        content: output,
        firstLineExceedsLimit: false,
        lastLinePartial: false,
        outputBytes: Buffer.byteLength(output, 'utf-8'),
        outputLines: kept.length,
        truncated: true,
        truncatedBy,
    };
}

export function truncateTail(content: string, options: TruncationOptions = {}) {
    const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const totalBytes = Buffer.byteLength(content, 'utf-8');
    const lines = splitLinesForCounting(content);
    const totalLines = lines.length;
    const limits = { maxBytes, maxLines, totalBytes, totalLines };

    if (totalLines <= maxLines && totalBytes <= maxBytes) {
        return untruncated(content, limits);
    }

    const kept: string[] = [];
    let keptBytes = 0;
    let truncatedBy: 'lines' | 'bytes' = 'lines';
    let lastLinePartial = false;
    for (let index = lines.length - 1; index >= 0 && kept.length < maxLines; index--) {
        const line = lines[index] ?? '';
        const lineBytes = Buffer.byteLength(line, 'utf-8') + (kept.length > 0 ? 1 : 0);
        if (keptBytes + lineBytes > maxBytes) {
            truncatedBy = 'bytes';
            if (kept.length === 0) {
                const partial = truncateStringToBytesFromEnd(line, maxBytes);
                kept.unshift(partial);
                keptBytes = Buffer.byteLength(partial, 'utf-8');
                lastLinePartial = true;
            }
            break;
        }
        kept.unshift(line);
        keptBytes += lineBytes;
    }
    if (kept.length >= maxLines && keptBytes <= maxBytes) {
        truncatedBy = 'lines';
    }

    const output = kept.join('\n');
    return {
        ...limits,
        content: output,
        firstLineExceedsLimit: false,
        lastLinePartial,
        outputBytes: Buffer.byteLength(output, 'utf-8'),
        outputLines: kept.length,
        truncated: true,
        truncatedBy,
    };
}

export function truncateLine(line: string, maxChars: number = GREP_MAX_LINE_LENGTH) {
    if (line.length <= maxChars) {
        return { text: line, wasTruncated: false };
    }
    return { text: `${sliceHead(line, maxChars)}... [truncated]`, wasTruncated: true };
}

export function sliceHead(text: string, maxUnits: number) {
    const end = Math.max(0, maxUnits);
    return isHighSurrogate(text.charCodeAt(end - 1)) && isLowSurrogate(text.charCodeAt(end))
        ? text.slice(0, end - 1)
        : text.slice(0, end);
}

export function sliceTail(text: string, maxUnits: number) {
    if (maxUnits <= 0) {
        return '';
    }
    const start = Math.max(0, text.length - maxUnits);
    return isLowSurrogate(text.charCodeAt(start)) && isHighSurrogate(text.charCodeAt(start - 1))
        ? text.slice(start + 1)
        : text.slice(start);
}

function untruncated(
    content: string,
    limits: Pick<TruncationResult, 'maxBytes' | 'maxLines' | 'totalBytes' | 'totalLines'>
) {
    return {
        ...limits,
        content,
        firstLineExceedsLimit: false,
        lastLinePartial: false,
        outputBytes: limits.totalBytes,
        outputLines: limits.totalLines,
        truncated: false,
        truncatedBy: null,
    };
}

function splitLinesForCounting(content: string) {
    if (content.length === 0) {
        return [];
    }
    const lines = content.split('\n');
    if (content.endsWith('\n')) {
        lines.pop();
    }
    return lines;
}

function truncateStringToBytesFromEnd(text: string, maxBytes: number) {
    const buffer = Buffer.from(text, 'utf-8');
    if (buffer.length <= maxBytes) {
        return text;
    }
    let start = buffer.length - maxBytes;
    while (start < buffer.length && ((buffer[start] ?? 0) & 0xc0) === 0x80) {
        start++;
    }
    return buffer.subarray(start).toString('utf-8');
}

function isHighSurrogate(code: number) {
    return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number) {
    return code >= 0xdc00 && code <= 0xdfff;
}

import { createWriteStream, type WriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import {
    DEFAULT_MAX_BYTES,
    DEFAULT_MAX_LINES,
    type TruncationResult,
    truncateTail,
} from './truncate.ts';

export interface OutputTailOptions {
    maxBytes?: number;
    maxLines?: number;
}

export class OutputTail {
    private readonly maxLines: number;
    private readonly maxBytes: number;
    private readonly maxRollingBytes: number;
    private readonly decoder = new TextDecoder();
    private readonly log: WriteStream;
    private logError: Error | undefined;

    private tailText = '';
    private tailBytes = 0;
    private tailStartsAtLineBoundary = true;
    private totalDecodedBytes = 0;
    private completedLines = 0;
    private totalLines = 0;
    private currentLineBytes = 0;
    private hasOpenLine = false;
    private ended = false;

    constructor(logPath: string, options: OutputTailOptions = {}) {
        this.maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
        this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
        this.maxRollingBytes = Math.max(this.maxBytes * 2, 1);
        this.log = createWriteStream(logPath, { flags: 'w', mode: 0o600 });
        this.log.on('error', (error) => {
            this.logError = error;
        });
    }

    append(data: Buffer) {
        if (this.ended) {
            throw new Error('Cannot append to a finished output tail');
        }
        this.log.write(data);
        this.appendDecodedText(this.decoder.decode(data, { stream: true }));
    }

    finish() {
        if (this.ended) {
            return;
        }
        this.ended = true;
        this.appendDecodedText(this.decoder.decode());
    }

    snapshot() {
        const snapshotText = this.snapshotText() || this.tailText;
        const tailTruncation = truncateTail(snapshotText, {
            maxBytes: this.maxBytes,
            maxLines: this.maxLines,
        });
        const truncated = this.totalLines > this.maxLines || this.totalDecodedBytes > this.maxBytes;
        const truncatedBy = truncated
            ? (tailTruncation.truncatedBy ??
              (this.totalDecodedBytes > this.maxBytes ? 'bytes' : 'lines'))
            : null;
        return {
            ...tailTruncation,
            maxBytes: this.maxBytes,
            maxLines: this.maxLines,
            totalBytes: this.totalDecodedBytes,
            totalLines: this.totalLines,
            truncated,
            truncatedBy,
        } satisfies TruncationResult;
    }

    async close() {
        this.log.end();
        await finished(this.log);
        if (this.logError) {
            throw this.logError;
        }
    }

    lastLineBytes() {
        return this.currentLineBytes;
    }

    private appendDecodedText(text: string) {
        if (text.length === 0) {
            return;
        }
        const bytes = Buffer.byteLength(text, 'utf-8');
        this.totalDecodedBytes += bytes;
        this.tailText += text;
        this.tailBytes += bytes;
        if (this.tailBytes > this.maxRollingBytes * 2) {
            this.trimTail();
        }

        let newlines = 0;
        let lastNewline = -1;
        for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
            newlines += 1;
            lastNewline = i;
        }
        if (newlines === 0) {
            this.currentLineBytes += bytes;
            this.hasOpenLine = true;
        } else {
            this.completedLines += newlines;
            const tail = text.slice(lastNewline + 1);
            this.currentLineBytes = Buffer.byteLength(tail, 'utf-8');
            this.hasOpenLine = tail.length > 0;
        }
        this.totalLines = this.completedLines + (this.hasOpenLine ? 1 : 0);
    }

    private trimTail() {
        const buffer = Buffer.from(this.tailText, 'utf-8');
        if (buffer.length <= this.maxRollingBytes) {
            this.tailBytes = buffer.length;
            return;
        }
        let start = buffer.length - this.maxRollingBytes;
        while (start < buffer.length && ((buffer[start] ?? 0) & 0xc0) === 0x80) {
            start += 1;
        }
        this.tailStartsAtLineBoundary =
            start === 0 ? this.tailStartsAtLineBoundary : buffer[start - 1] === 0x0a;
        this.tailText = buffer.subarray(start).toString('utf-8');
        this.tailBytes = Buffer.byteLength(this.tailText, 'utf-8');
    }

    private snapshotText() {
        if (this.tailStartsAtLineBoundary) {
            return this.tailText;
        }
        const firstNewline = this.tailText.indexOf('\n');
        return firstNewline === -1 ? this.tailText : this.tailText.slice(firstNewline + 1);
    }
}

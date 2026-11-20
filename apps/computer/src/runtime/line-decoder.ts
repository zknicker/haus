/**
 * Splits a byte stream into newline-delimited lines. A multi-byte UTF-8 character split across
 * chunks decodes whole, a partial trailing line waits for its newline, and `\r\n` endings lose
 * their `\r`. A line longer than `maxLineChars` is a protocol failure, not a buffer to grow.
 */
export class LineDecoder {
    private readonly decoder = new TextDecoder('utf-8', { fatal: false });
    private pending = '';

    constructor(private readonly maxLineChars = 64 * 1024 * 1024) {}

    /** Returns every line the chunk completed, in order. */
    push(chunk: Uint8Array): string[] {
        return this.split(this.decoder.decode(chunk, { stream: true }));
    }

    /** Flushes the decoder; a final line without a newline still counts. */
    end(): string[] {
        const lines = this.split(this.decoder.decode());
        const rest = this.pending;
        this.pending = '';
        return rest.length > 0 ? [...lines, stripCarriageReturn(rest)] : lines;
    }

    private split(text: string): string[] {
        this.pending += text;
        const lines: string[] = [];
        let newline = this.pending.indexOf('\n');
        while (newline >= 0) {
            lines.push(stripCarriageReturn(this.pending.slice(0, newline)));
            this.pending = this.pending.slice(newline + 1);
            newline = this.pending.indexOf('\n');
        }
        if (this.pending.length > this.maxLineChars) {
            throw new Error(`A protocol line exceeded ${this.maxLineChars} characters.`);
        }
        return lines;
    }
}

function stripCarriageReturn(line: string): string {
    return line.endsWith('\r') ? line.slice(0, -1) : line;
}

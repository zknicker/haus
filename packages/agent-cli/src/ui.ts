import computerPackage from '../../package.json' with { type: 'json' };

/** ANSI styling, gated on TTY + NO_COLOR. All CLI output routes through here. */

const CODES = {
    reset: '[0m',
    bold: '[1m',
    dim: '[2m',
    accent: '[38;5;213m',
    yellow: '[33m',
    red: '[31m',
    green: '[32m',
} as const;

type ColorName = keyof typeof CODES;

/** True when the given stream is a TTY and NO_COLOR is unset. */
export function colorEnabled(stream: NodeJS.WriteStream = process.stdout): boolean {
    return Boolean(stream.isTTY) && !process.env.NO_COLOR;
}

function paint(text: string, color: ColorName, stream: NodeJS.WriteStream): string {
    if (!colorEnabled(stream)) {
        return text;
    }
    return `${CODES[color]}${text}${CODES.reset}`;
}

export const ui = {
    accent: (text: string, stream?: NodeJS.WriteStream) =>
        paint(text, 'accent', stream ?? process.stdout),
    bold: (text: string, stream?: NodeJS.WriteStream) =>
        paint(text, 'bold', stream ?? process.stdout),
    dim: (text: string, stream?: NodeJS.WriteStream) =>
        paint(text, 'dim', stream ?? process.stdout),
};

/**
 * Banner: name + version + one-line tagline, accent color. ≤ 6 lines including
 * the trailing blank. Compact wordmark, no figlet.
 */
export function banner(): string {
    const title = ui.accent(ui.bold('🟠 Haus Computer'));
    const version = ui.dim(`v${computerPackage.version}`);
    return `${title} ${version}\n${ui.dim('The local execution home for your agents.')}\n`;
}

/** Section heading, bold. */
export function heading(label: string, stream: NodeJS.WriteStream = process.stdout): string {
    return ui.bold(label, stream);
}

/**
 * Two-column aligned rows. Left column padded to the widest entry so summaries
 * line up. Returns the joined block.
 */
export function rows(entries: { left: string; right: string }[], indent = '  '): string {
    const width = entries.reduce((max, entry) => Math.max(max, entry.left.length), 0);
    return entries
        .map((entry) => `${indent}${entry.left.padEnd(width)}  ${entry.right}`)
        .join('\n');
}

/**
 * Aligned multi-column table. Each cell column is padded to its widest entry so
 * values line up; the final column is left unpadded. Returns the joined block.
 * Used for aligned command output in place of raw `\t` joins.
 */
export function table(rowsOfCells: string[][], indent = '  '): string {
    if (rowsOfCells.length === 0) {
        return '';
    }
    const columns = rowsOfCells.reduce((max, cells) => Math.max(max, cells.length), 0);
    const widths: number[] = [];
    for (let col = 0; col < columns - 1; col++) {
        widths[col] = rowsOfCells.reduce((max, cells) => Math.max(max, cells[col]?.length ?? 0), 0);
    }
    return rowsOfCells
        .map((cells) =>
            cells
                .map((cell, col) => (col < columns - 1 ? cell.padEnd(widths[col]) : cell))
                .join('  ')
        )
        .map((line) => `${indent}${line}`)
        .join('\n');
}

/**
 * The single JSON writer for `--json` commands. One pretty-printed document plus
 * a trailing newline, never any ANSI regardless of TTY. All read commands route
 * machine output through here so the shape stays uniform.
 */
export function writeJson(value: unknown, write: (text: string) => void = stdoutWrite): void {
    write(`${JSON.stringify(value, null, 2)}\n`);
}

function stdoutWrite(text: string): void {
    process.stdout.write(text);
}

/** Error block: `✗ message` plus one `  ↳ hint` line per hint, all on stderr. */
export function errorBlock(message: string, ...hints: string[]): string {
    const mark = paint('✗', 'red', process.stderr);
    const lines = [`${mark} ${message}`];
    for (const hint of hints) {
        lines.push(ui.dim(`  ↳ ${hint}`, process.stderr));
    }
    return lines.join('\n');
}

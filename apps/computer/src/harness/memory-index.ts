import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * EXPERIMENT (wake-recycle prototype): Raft's startup memory block. The head of MEMORY.md rides
 * the first input of a recycled session so the Agent need not spend a round trip reading it.
 * The file itself is never truncated.
 */
export const memoryIndexBudgetBytes = 16 * 1024;

/** Cuts at a code-point boundary, backing up to the last newline when it is in the final 20%. */
export function memoryHead(content: string, maxBytes: number): { complete: boolean; head: string } {
    const bytes = Buffer.from(content, 'utf8');
    if (bytes.length <= maxBytes) {
        return { complete: true, head: content };
    }
    let end = maxBytes;
    // Never split a UTF-8 sequence: continuation bytes are 10xxxxxx.
    while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) {
        end -= 1;
    }
    let head = bytes.subarray(0, end).toString('utf8');
    const newline = head.lastIndexOf('\n');
    if (newline >= 0 && Buffer.byteLength(head.slice(0, newline + 1)) >= maxBytes * 0.8) {
        head = head.slice(0, newline + 1);
    }
    return { complete: false, head };
}

export function formatMemoryIndex(content: string, maxBytes = memoryIndexBudgetBytes): string {
    const size = kb(Buffer.byteLength(content, 'utf8'));
    const { complete, head } = memoryHead(content, maxBytes);
    const attributes = complete
        ? `file="MEMORY.md" size="${size} KB" complete="true" note="no need to re-read MEMORY.md unless you change it"`
        : `file="MEMORY.md" size="${size} KB" tokens="~${Math.ceil(Buffer.byteLength(content) / 4)}" shown="first ${kb(Buffer.byteLength(head))} KB" note="read the file for the rest"`;
    return `<memory-index ${attributes}>\n${head.trimEnd()}\n</memory-index>`;
}

/** Missing, empty, or unreadable MEMORY.md never blocks a wake. */
export async function readMemoryIndex(workspaceDir: string): Promise<string | null> {
    try {
        const content = await readFile(join(workspaceDir, 'MEMORY.md'), 'utf8');
        return content.trim().length > 0 ? formatMemoryIndex(content) : null;
    } catch {
        return null;
    }
}

function kb(bytes: number): string {
    return (bytes / 1024).toFixed(1);
}

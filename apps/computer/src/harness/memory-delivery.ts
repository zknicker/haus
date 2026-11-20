import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { formatMemoryBlock, memoryFileName } from '@haus/agent-prompt';

/**
 * Delivers the Agent's MEMORY.md in the turn input (ADR 0052), so the Agent never has to
 * remember to read it. The session record keeps a memory receipt, the digest of the content this
 * native session holds. A turn carries the file only when its digest differs from the receipt, so
 * an unchanged file adds nothing and the conversation and prompt cache do not grow a copy per
 * turn. Like the instruction receipt (`instructions-update.ts`), it advances only after a
 * completed turn that knew the file's content (it carried it, or the session already had it), to
 * the content at turn end, which covers the turn's own edits; a fresh launch or a compacted turn
 * resets it, so the next turn carries the file again. A sub-agent wake defers it, because Claude
 * Code's adopted wake turn replaces the prompt.
 */
export interface MemoryDelivery {
    /** What this turn's input carries; null when there is nothing new to deliver or a wake defers it. */
    block: string | null;
    /** The session knows the file's content at turn start: it carries it, already has it, or none exists. */
    known: boolean;
    /** The receipt this native session held before the turn; a fresh launch holds none. */
    priorReceipt: string | null;
}

export async function planMemoryDelivery(input: {
    isResume: boolean;
    receipt: string | null;
    wake: boolean;
    memoryPath: string;
}): Promise<MemoryDelivery> {
    const priorReceipt = input.isResume ? input.receipt : null;
    const content = await readMemory(input.memoryPath);
    if (content === null || memoryDigest(content) === priorReceipt) {
        return { block: null, known: true, priorReceipt };
    }
    if (input.wake) {
        return { block: null, known: false, priorReceipt };
    }
    return { block: formatMemoryBlock(content), known: true, priorReceipt };
}

/** The turn's model prompt, led by the memory block when the turn carries one. */
export function withMemory(delivery: MemoryDelivery, prompt: string): string {
    return delivery.block ? `${delivery.block}\n\n${prompt}` : prompt;
}

/**
 * The receipt a turn leaves. A compaction can summarize the file away, so it clears the receipt.
 * A completed turn that knew the content holds whatever the file is at turn end, its own edits
 * included. Anything else keeps the receipt the session held.
 */
export function memoryReceiptAfterTurn(
    delivery: MemoryDelivery,
    turn: { compacted: boolean; completed: boolean; endDigest: string | null }
): string | null {
    if (turn.compacted) {
        return null;
    }
    return turn.completed && delivery.known ? turn.endDigest : delivery.priorReceipt;
}

/** The digest of MEMORY.md as it is now; null when the file is missing. */
export async function readMemoryDigest(memoryPath: string): Promise<string | null> {
    const content = await readMemory(memoryPath);
    return content === null ? null : memoryDigest(content);
}

function memoryDigest(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

/** The file's content; null when it is missing or unreadable, which never fails a turn. */
async function readMemory(memoryPath: string): Promise<string | null> {
    try {
        return await readFile(memoryPath, 'utf8');
    } catch (error) {
        const code = (error as NodeJS.ErrnoException | null)?.code;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') {
            process.stderr.write(
                `${memoryFileName} is unreadable (${code ?? String(error)}); delivering none.\n`
            );
        }
        return null;
    }
}

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    formatMemoryBlock,
    type MemoryDelivery,
    memoryCharacterCap,
    memoryReceiptAfterTurn,
    planMemoryDelivery,
    readMemoryDigest,
} from './memory-delivery.ts';

let workspaceDir: string;

beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), 'haus-memory-delivery-'));
});

afterEach(async () => {
    await rm(workspaceDir, { force: true, recursive: true });
});

test('a missing MEMORY.md delivers nothing', async () => {
    const plan = await planMemoryDelivery({
        isResume: true,
        receipt: null,
        wake: false,
        workspaceDir,
    });
    expect(plan).toEqual({ block: null, known: true, priorReceipt: null });
    expect(await readMemoryDigest(workspaceDir)).toBeNull();
});

test('a resumed session whose receipt matches the file gets nothing; a changed file is delivered', async () => {
    await writeMemory('# Kit\n\n## Role\nRelease manager.\n');
    const receipt = await readMemoryDigest(workspaceDir);
    const unchanged = await planMemoryDelivery({
        isResume: true,
        receipt,
        wake: false,
        workspaceDir,
    });
    expect(unchanged.block).toBeNull();
    expect(unchanged.known).toBe(true);

    await writeMemory('# Kit\n\n## Role\nRelease manager and on-call.\n');
    const changed = await planMemoryDelivery({
        isResume: true,
        receipt,
        wake: false,
        workspaceDir,
    });
    expect(changed.block).toContain('Release manager and on-call.');
    expect(changed.block?.startsWith('<haus-memory>')).toBe(true);
    expect(changed.block?.endsWith('</haus-memory>')).toBe(true);
});

test('a fresh launch ignores any stored receipt and carries the file', async () => {
    await writeMemory('# Kit\n');
    const receipt = await readMemoryDigest(workspaceDir);
    const plan = await planMemoryDelivery({ isResume: false, receipt, wake: false, workspaceDir });
    expect(plan.block).toContain('# Kit');
    expect(plan.priorReceipt).toBeNull();
});

test('a sub-agent wake defers a changed file without claiming the session knows it', async () => {
    await writeMemory('# Kit\n');
    const plan = await planMemoryDelivery({
        isResume: true,
        receipt: 'older',
        wake: true,
        workspaceDir,
    });
    expect(plan).toEqual({ block: null, known: false, priorReceipt: 'older' });
});

test('a file over the cap is cut at a line boundary with a notice naming its size and the cap', () => {
    const line = `${'x'.repeat(99)}\n`;
    const content = line.repeat(100);
    const block = formatMemoryBlock(content);
    const body = block.split('\n').filter((entry) => entry === 'x'.repeat(99));
    expect(body).toHaveLength(80);
    expect(body.join('\n').length).toBeLessThanOrEqual(memoryCharacterCap);
    expect(block).toContain(
        '[MEMORY.md is 9,999 characters, over the 8,000-character cap, so Haus cut it at the last full line above. Tighten MEMORY.md under 8,000 characters'
    );
});

test('a file within the cap is delivered whole with no notice', () => {
    const block = formatMemoryBlock('# Kit\n\n## Role\nRelease manager.\n');
    expect(block).toContain('## Role\nRelease manager.\n</haus-memory>');
    expect(block).not.toContain('-character cap');
});

test('the receipt clears on a compaction, follows the file after a completed turn that knew it, and holds otherwise', () => {
    const carried: MemoryDelivery = { block: '<haus-memory>', known: true, priorReceipt: 'a' };
    const deferred: MemoryDelivery = { block: null, known: false, priorReceipt: 'a' };
    const turn = (compacted: boolean, completed: boolean) => ({
        compacted,
        completed,
        endDigest: 'b',
    });

    expect(memoryReceiptAfterTurn(carried, turn(true, true))).toBeNull();
    expect(memoryReceiptAfterTurn(carried, turn(true, false))).toBeNull();
    // The turn's own edits produced `b`, so the next turn need not carry it.
    expect(memoryReceiptAfterTurn(carried, turn(false, true))).toBe('b');
    expect(memoryReceiptAfterTurn(carried, turn(false, false))).toBe('a');
    expect(memoryReceiptAfterTurn(deferred, turn(false, true))).toBe('a');
});

async function writeMemory(content: string) {
    await writeFile(join(workspaceDir, 'MEMORY.md'), content);
}

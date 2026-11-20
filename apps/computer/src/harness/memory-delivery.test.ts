import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { agentDrive } from '../drive/agent-drive.ts';
import {
    type MemoryDelivery,
    memoryReceiptAfterTurn,
    planMemoryDelivery,
    readMemoryDigest,
} from './memory-delivery.ts';

let root: string;
let memoryPath: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-memory-delivery-'));
    memoryPath = agentDrive(root, 'kit').memory;
    await mkdir(dirname(memoryPath), { recursive: true });
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

test('a missing MEMORY.md delivers nothing', async () => {
    const plan = await planMemoryDelivery({
        isResume: true,
        receipt: null,
        wake: false,
        memoryPath,
    });
    expect(plan).toEqual({ block: null, known: true, priorReceipt: null });
    expect(await readMemoryDigest(memoryPath)).toBeNull();
});

test('a resumed session whose receipt matches the file gets nothing; a changed file is delivered', async () => {
    await writeMemory('# Kit\n\n## Role\nRelease manager.\n');
    const receipt = await readMemoryDigest(memoryPath);
    const unchanged = await planMemoryDelivery({
        isResume: true,
        receipt,
        wake: false,
        memoryPath,
    });
    expect(unchanged.block).toBeNull();
    expect(unchanged.known).toBe(true);

    await writeMemory('# Kit\n\n## Role\nRelease manager and on-call.\n');
    const changed = await planMemoryDelivery({
        isResume: true,
        receipt,
        wake: false,
        memoryPath,
    });
    expect(changed.block).toContain('Release manager and on-call.');
    expect(changed.block?.startsWith('<haus-memory>')).toBe(true);
    expect(changed.block?.endsWith('</haus-memory>')).toBe(true);
});

test('a fresh launch ignores any stored receipt and carries the file', async () => {
    await writeMemory('# Kit\n');
    const receipt = await readMemoryDigest(memoryPath);
    const plan = await planMemoryDelivery({ isResume: false, receipt, wake: false, memoryPath });
    expect(plan.block).toContain('# Kit');
    expect(plan.priorReceipt).toBeNull();
});

test('a sub-agent wake defers a changed file without claiming the session knows it', async () => {
    await writeMemory('# Kit\n');
    const plan = await planMemoryDelivery({
        isResume: true,
        receipt: 'older',
        wake: true,
        memoryPath,
    });
    expect(plan).toEqual({ block: null, known: false, priorReceipt: 'older' });
});

test('an unreadable MEMORY.md is treated as missing', async () => {
    await mkdir(memoryPath);
    const plan = await planMemoryDelivery({
        isResume: true,
        receipt: 'older',
        wake: false,
        memoryPath,
    });
    expect(plan.block).toBeNull();
    expect(await readMemoryDigest(memoryPath)).toBeNull();
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
    await writeFile(memoryPath, content);
}

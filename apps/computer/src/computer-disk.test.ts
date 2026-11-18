import { expect, test } from 'bun:test';
import { statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { computerDiskReportSchema } from '@haus/api';
import { sendComputerDiskReport } from './computer-disk.ts';

test('Computer reports real host capacity and clears an unavailable measurement', async () => {
    const frames: unknown[] = [];
    const send = (frame: unknown) => {
        frames.push(frame);
        return true;
    };
    await sendComputerDiskReport(tmpdir(), send);
    const sample = computerDiskReportSchema.parse(frames[0]).disk;
    const fs = await statfs(tmpdir());
    expect(sample?.totalBytes).toBe(fs.blocks * fs.bsize);
    expect(sample?.availableBytes).toBeGreaterThan(0);
    await sendComputerDiskReport('/a-directory-that-does-not-exist/haus-disk-report', send);
    expect(computerDiskReportSchema.parse(frames[1]).disk).toBeNull();
});

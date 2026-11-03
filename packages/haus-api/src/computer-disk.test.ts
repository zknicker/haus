import { expect, test } from 'bun:test';
import { computerDiskReportSchema, computerDiskSeverity } from './computer-disk.ts';

const GiB = 1024 ** 3;

test('low disk uses both real free bytes and percentage, with increasing severity', () => {
    expect(computerDiskSeverity(null)).toBeNull();
    expect(computerDiskSeverity({ availableBytes: 20 * GiB, totalBytes: 1000 * GiB })).toBeNull();
    expect(computerDiskSeverity({ availableBytes: 15 * GiB, totalBytes: 100 * GiB })).toBeNull();
    expect(computerDiskSeverity({ availableBytes: 9 * GiB, totalBytes: 100 * GiB })).toBe(
        'under10'
    );
    expect(computerDiskSeverity({ availableBytes: 4 * GiB, totalBytes: 100 * GiB })).toBe('under5');
    expect(computerDiskSeverity({ availableBytes: GiB, totalBytes: 100 * GiB })).toBe('under2');
    expect(computerDiskSeverity({ availableBytes: 0, totalBytes: 100 * GiB })).toBe('under1');
});

test('disk reports reject impossible samples and accept unavailable measurements', () => {
    for (const disk of [
        { availableBytes: -1, totalBytes: 1 },
        { availableBytes: 2, totalBytes: 1 },
        { availableBytes: 0, totalBytes: 0 },
        { availableBytes: 0.5, totalBytes: 1 },
    ]) {
        expect(computerDiskReportSchema.safeParse({ type: 'disk-report', disk }).success).toBe(
            false
        );
    }
    expect(computerDiskReportSchema.parse({ type: 'disk-report', disk: null }).disk).toBeNull();
});

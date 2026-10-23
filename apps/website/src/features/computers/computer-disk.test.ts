import { expect, test } from 'bun:test';
import { computerDiskWarning, shouldShowDiskNotice } from './computer-disk.ts';

test('offline and unknown disk samples do not render warnings', () => {
    const diskStatus = { availableBytes: 1024 ** 3, totalBytes: 100 * 1024 ** 3 };
    expect(computerDiskWarning({ health: 'offline', diskStatus })).toBeNull();
    expect(computerDiskWarning({ health: 'healthy', diskStatus: null })).toBeNull();
    expect(computerDiskWarning({ health: 'healthy', diskStatus })).toEqual({
        severity: 'under2',
        label: '1 GiB free (1%)',
    });
});

test('dismissal survives small fluctuations and reappears only in a worse band', () => {
    expect(shouldShowDiskNotice('under5', null)).toBe(true);
    expect(shouldShowDiskNotice('under5', 'under5')).toBe(false);
    expect(shouldShowDiskNotice('under10', 'under5')).toBe(false);
    expect(shouldShowDiskNotice('under2', 'under5')).toBe(true);
    expect(shouldShowDiskNotice('under1', 'invalid')).toBe(true);
});

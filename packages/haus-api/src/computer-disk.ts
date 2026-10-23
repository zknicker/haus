import { z } from 'zod';

export const computerDiskStatusSchema = z
    .object({
        availableBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        totalBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    })
    .strict()
    .refine((disk) => disk.availableBytes <= disk.totalBytes);

export type ComputerDiskStatus = z.infer<typeof computerDiskStatusSchema>;

export const computerDiskReportSchema = z
    .object({
        type: z.literal('disk-report'),
        disk: computerDiskStatusSchema.nullable(),
    })
    .strict();

/** Actual host pressure, independent of workspace count or potential future writes. */
export type ComputerDiskSeverity = 'under10' | 'under5' | 'under2' | 'under1';

export function computerDiskSeverity(
    disk: ComputerDiskStatus | null | undefined
): ComputerDiskSeverity | null {
    if (!disk || disk.availableBytes >= 20 * 1024 ** 3) {
        return null;
    }
    const percent = (disk.availableBytes / disk.totalBytes) * 100;
    if (percent >= 10) {
        return null;
    }
    if (percent < 1) {
        return 'under1';
    }
    if (percent < 2) {
        return 'under2';
    }
    if (percent < 5) {
        return 'under5';
    }
    return 'under10';
}

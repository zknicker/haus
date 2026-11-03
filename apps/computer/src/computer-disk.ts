import { statfs } from 'node:fs/promises';
import { computerDiskStatusSchema } from '@haus/api';

/** A failed measurement clears the last sample; it never changes execution readiness. */
export async function sendComputerDiskReport(dataRoot: string, send: (frame: unknown) => boolean) {
    try {
        const info = await statfs(dataRoot);
        const disk = computerDiskStatusSchema.parse({
            availableBytes: info.bavail * info.bsize,
            totalBytes: info.blocks * info.bsize,
        });
        send({ type: 'disk-report', disk });
    } catch (error) {
        send({ type: 'disk-report', disk: null });
        console.warn(
            `Computer disk measurement failed: ${error instanceof Error ? error.message : error}`
        );
    }
}

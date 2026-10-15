import type { PlannedUpload } from '../../features/artifacts/upload-plan.ts';

/**
 * Each planned file's SHA-256 (lowercase hex, the drive's `sha256`), keyed by
 * its planned path. Hashes one file at a time so a folder of large prints
 * never holds more than one in memory.
 */
export async function uploadDigests(
    uploads: readonly PlannedUpload<File>[]
): Promise<Map<string, string>> {
    const digests = new Map<string, string>();
    for (const upload of uploads) {
        const digest = await crypto.subtle.digest('SHA-256', await upload.file.arrayBuffer());
        digests.set(
            upload.path,
            Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
                ''
            )
        );
    }
    return digests;
}

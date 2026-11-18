import { createHash } from 'node:crypto';

import coveAvatarPath from '../../../website/public/prototypes/cove-avatar.png' with { type: 'file' };
import { createAvatarId } from '../avatars/avatar-bytes.ts';

/** Builds the release-owned Cove avatar row shared by production onboarding and dev seeding. */
export async function createCoveAvatarRow() {
    const bytes = new Uint8Array(await Bun.file(coveAvatarPath).arrayBuffer());
    return {
        byteSize: bytes.byteLength,
        bytes,
        id: createAvatarId(),
        mediaType: 'image/png' as const,
        sha256: createHash('sha256').update(bytes).digest('hex'),
    };
}

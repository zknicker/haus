import { type AvatarMediaType, isAvatarId } from '@haus/api/avatar';
import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { avatarsTable } from '../postgres/schema.ts';

export interface StoredAvatar {
    byteSize: number;
    bytes: Uint8Array;
    mediaType: AvatarMediaType;
}

/** Reads one avatar by its opaque id. Nothing here is Server-scoped. */
export async function readAvatar(
    db: Pick<HausDatabase, 'select'>,
    avatarId: string
): Promise<StoredAvatar | null> {
    if (!isAvatarId(avatarId)) {
        return null;
    }

    const [avatar] = await db
        .select({
            byteSize: avatarsTable.byteSize,
            bytes: avatarsTable.bytes,
            mediaType: avatarsTable.mediaType,
        })
        .from(avatarsTable)
        .where(eq(avatarsTable.id, avatarId))
        .limit(1);

    return avatar ?? null;
}

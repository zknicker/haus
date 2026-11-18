import { createHash } from 'node:crypto';
import type { AvatarMediaType } from '@haus/api/avatar';
import { createAvatarId } from '../avatars/avatar-bytes.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { avatarsTable } from '../postgres/schema.ts';
import blippyAvatarPath from './seed-avatars/blippy.png' with { type: 'file' };
import ownerAvatarPath from './seed-avatars/owner.jpg' with { type: 'file' };
import tinyAvatarPath from './seed-avatars/tiny.png' with { type: 'file' };

/** The demo workspace ships with real faces, so nothing renders as initials. */
export interface SeededAvatarIds {
    blippy: string;
    owner: string;
    tiny: string;
}

type AvatarWriter = Pick<HausDatabase, 'insert'>;

const seedAvatarFiles = [
    { key: 'blippy', mediaType: 'image/png', path: blippyAvatarPath },
    { key: 'owner', mediaType: 'image/jpeg', path: ownerAvatarPath },
    { key: 'tiny', mediaType: 'image/png', path: tinyAvatarPath },
] as const satisfies readonly {
    key: keyof SeededAvatarIds;
    mediaType: AvatarMediaType;
    path: string;
}[];

/**
 * Writes the demo avatar images and hands back their ids. The bytes are read
 * from the files beside this module rather than inlined, so replacing a demo
 * face is a matter of dropping in a new image.
 */
export async function insertSeedAvatars(tx: AvatarWriter): Promise<SeededAvatarIds> {
    const rows = await Promise.all(
        seedAvatarFiles.map(async (file) => {
            const bytes = new Uint8Array(await Bun.file(file.path).arrayBuffer());

            return {
                byteSize: bytes.byteLength,
                bytes,
                id: createAvatarId(),
                key: file.key,
                mediaType: file.mediaType,
                sha256: createHash('sha256').update(bytes).digest('hex'),
            };
        })
    );

    await tx.insert(avatarsTable).values(rows.map(({ key, ...row }) => row));

    return Object.fromEntries(rows.map((row) => [row.key, row.id])) as unknown as SeededAvatarIds;
}

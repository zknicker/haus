import type { AgentSetAgentAvatarReceipt } from '@haus/api';
import type { NormalizedAvatarImage } from '../avatar-generation/normalization.ts';
import { createAvatarId, hashAvatarBytes } from '../avatars/avatar-bytes.ts';
import { assignAvatar } from '../avatars/set-avatar.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { avatarsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { readCreatedAgent } from './agent-created-shape.ts';
import { AgentTargetNotFoundError } from './errors.ts';
import { resolveEditableAgent } from './update-agent-description.ts';

/**
 * Points another Agent at a freshly generated avatar. Generation happens before
 * this call — it is a long provider round trip and must not hold the Server row
 * lock — so this is only the write.
 */
export async function setAgentAvatarFromAgent(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { agent: string; avatar: NormalizedAvatarImage }
): Promise<AgentSetAgentAvatarReceipt> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const target = await resolveEditableAgent(tx, runner.serverId, input.agent);

        const avatarId = createAvatarId();
        await tx.insert(avatarsTable).values({
            byteSize: input.avatar.byteSize,
            bytes: Buffer.from(input.avatar.bytes),
            id: avatarId,
            mediaType: input.avatar.mediaType,
            sha256: hashAvatarBytes(input.avatar.bytes),
        });
        await assignAvatar(
            tx,
            { id: target.id, kind: 'agent', serverId: runner.serverId },
            avatarId
        );

        const agent = await readCreatedAgent(tx, runner.serverId, target.id);
        if (!agent) {
            throw new AgentTargetNotFoundError(target.handle);
        }
        return {
            agent,
            avatar: {
                byteSize: input.avatar.byteSize,
                height: input.avatar.height,
                mediaType: input.avatar.mediaType,
                width: input.avatar.width,
            },
        };
    });
}

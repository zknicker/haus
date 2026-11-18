import type { FastifyInstance } from 'fastify';
import type { HausDatabase } from '../postgres/connection.ts';
import { avatarRoutePrefix } from './avatar-url.ts';
import { readAvatar } from './read-avatar.ts';

interface AvatarRouteDependencies {
    db: HausDatabase;
}

/**
 * Serves avatar bytes to an ordinary `<img>`, which cannot carry a session
 * token. Ids are opaque and a fresh id is minted on every replacement, so the
 * bytes are immutable and safe to cache for a year.
 */
export function registerAvatarRoutes(app: FastifyInstance, dependencies: AvatarRouteDependencies) {
    app.get<{ Params: { avatarId: string } }>(
        `${avatarRoutePrefix}/:avatarId`,
        async (request, reply) => {
            const avatar = await readAvatar(dependencies.db, request.params.avatarId);

            if (!avatar) {
                return await reply.code(404).send({ error: 'No avatar exists with that id.' });
            }

            reply.headers({
                'cache-control': 'public, max-age=31536000, immutable',
                'content-length': avatar.byteSize,
                'content-type': avatar.mediaType,
                'x-content-type-options': 'nosniff',
            });
            return await reply.send(Buffer.from(avatar.bytes));
        }
    );
}

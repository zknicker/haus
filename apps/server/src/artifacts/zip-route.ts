import type { FastifyInstance, FastifyReply } from 'fastify';
import type { HausDatabase } from '../postgres/connection.ts';
import { ServerAccessDeniedError, ServerNotFoundError } from '../servers/server-access.ts';
import { attachmentDisposition } from '../utils/content-disposition.ts';
import { artifactAccess } from './access.ts';
import { ArtifactError, type ArtifactStorage, requireArtifactStorage } from './storage.ts';
import { planArtifactZip } from './zip-plan.ts';
import { streamArtifactZip } from './zip-stream.ts';
import type { ZipTickets } from './zip-tickets.ts';

/**
 * `GET /artifacts/zip/:token` streams the selection a zip link names (`artifact.zip` issues
 * them) as one STORE archive. The link is the credential, like a signed storage link, but the
 * Server checks the issuing member's access and re-reads the selection when it is opened, so a
 * file deleted since is left out and lost membership refuses the download. Failures answer a
 * short plain-text page: the link opens as a browser navigation, not a fetch.
 */
export function registerArtifactZipRoute(
    app: FastifyInstance,
    options: { db: HausDatabase; storage: ArtifactStorage | null; tickets: ZipTickets }
) {
    app.get<{ Params: { token: string } }>('/artifacts/zip/:token', async (request, reply) => {
        try {
            const ticket = options.tickets.read(request.params.token);
            if (!ticket) {
                throw new ArtifactError(
                    'This download link expired. Download again from Files.',
                    404,
                    'NOT_FOUND'
                );
            }
            const storage = requireArtifactStorage(options.storage);
            const access = await artifactAccess(options.db, ticket.actor);
            const plan = await planArtifactZip(options.db, access, ticket.selection);
            // HEAD (Fastify answers it with this handler) needs the headers, never a storage read.
            // A cancelled download closes the response; Fastify then cancels this stream, which
            // cancels the open storage read (haus-artifact-zip.test.ts proves it).
            const body =
                request.method === 'HEAD'
                    ? new ReadableStream<Uint8Array>()
                    : streamArtifactZip(storage, plan.entries);
            return await reply
                .headers({
                    'cache-control': 'no-store',
                    'content-disposition': attachmentDisposition(plan.filename),
                    'content-type': 'application/zip',
                    'x-content-type-options': 'nosniff',
                })
                .send(body);
        } catch (cause) {
            return await sendZipFailure(reply, cause);
        }
    });
}

async function sendZipFailure(reply: FastifyReply, cause: unknown) {
    const failure = zipFailure(cause);
    if (failure.status >= 500) {
        reply.log.error(cause);
    }
    return await reply
        .code(failure.status)
        .headers({
            'cache-control': 'no-store',
            'content-type': 'text/plain; charset=utf-8',
            'x-content-type-options': 'nosniff',
        })
        .send(failure.message);
}

function zipFailure(cause: unknown): { message: string; status: number } {
    if (cause instanceof ArtifactError) {
        return { message: cause.message, status: cause.status };
    }
    if (cause instanceof ServerAccessDeniedError) {
        return { message: cause.message, status: 403 };
    }
    if (cause instanceof ServerNotFoundError) {
        return { message: cause.message, status: 404 };
    }
    return { message: 'The Server could not build this download.', status: 500 };
}

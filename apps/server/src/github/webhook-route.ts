import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { bodyRefusal } from '../triggers/trigger-route.ts';
import type { GithubDelivery, GithubIngestOutcome } from './delivery-ingest.ts';
import { verifyGithubSignature } from './webhook-signature.ts';

/** GitHub caps webhook payloads at 25 MB; Haus accepts deliveries up to 10 MiB. */
export const githubWebhookBodyLimit = 10 * 1024 * 1024;
const deliveryGuidMaxLength = 64;

export interface GithubWebhookRouteOptions {
    ingest(delivery: GithubDelivery): Promise<GithubIngestOutcome>;
    path: string;
    /** The App's webhook secret, or null when the App is not configured. */
    webhookSecret: string | null;
}

interface Refusal {
    code: string;
    status: number;
}

/**
 * `POST /api/github/webhook`: every installation's deliveries
 * (specs/github-triggers.md#endpoint). The body is read raw so the signature
 * covers the exact bytes GitHub signed; it is parsed only once it verifies.
 * Every accepted delivery answers the same `202`, so the endpoint never
 * reveals whether an installation is bound here.
 */
export function registerGithubWebhookRoute(
    app: FastifyInstance,
    options: GithubWebhookRouteOptions
) {
    return app.register(async (scope) => {
        scope.removeAllContentTypeParsers();
        scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
            done(null, body);
        });
        scope.post(options.path, { bodyLimit: githubWebhookBodyLimit }, (request, reply) =>
            handleWebhook(options, request, reply)
        );
        // Fastify refuses an oversized body before the handler runs, so the
        // earlier answers in the endpoint's order are repeated here first.
        scope.setErrorHandler((error, request, reply) => {
            const refusal = bodyRefusal(error);
            if (!refusal) {
                return reply.send(error);
            }
            const earlier = configurationRefusal(options) ?? headerRefusal(request);
            const answer = earlier ?? refusal;
            return reply.code(answer.status).send({ code: answer.code });
        });
    });
}

async function handleWebhook(
    options: GithubWebhookRouteOptions,
    request: FastifyRequest,
    reply: FastifyReply
) {
    const refused = configurationRefusal(options) ?? headerRefusal(request);
    if (refused) {
        return reply.code(refused.status).send({ code: refused.code });
    }
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    if (body.byteLength > githubWebhookBodyLimit) {
        return reply.code(413).send({ code: 'payload_too_large' });
    }
    const headers = readHeaders(request);
    if (
        !(
            headers &&
            options.webhookSecret &&
            verifyGithubSignature({
                body,
                header: headers.signature,
                secret: options.webhookSecret,
            })
        )
    ) {
        return reply.code(401).send({ code: 'invalid_signature' });
    }
    const payload = parseJson(body);
    if (payload === undefined) {
        return reply.code(415).send({ code: 'unsupported_media_type' });
    }
    const outcome = await options.ingest({
        event: headers.event,
        guid: headers.guid,
        payload,
        source: 'webhook',
    });
    if (outcome.kind === 'duplicate') {
        return reply.code(200).send({ duplicate: true });
    }
    return reply.code(202).send({ routed: outcome.kind === 'accepted' ? outcome.routed : 0 });
}

function configurationRefusal(options: GithubWebhookRouteOptions): Refusal | null {
    return options.webhookSecret ? null : { code: 'github_app_unconfigured', status: 503 };
}

function headerRefusal(request: FastifyRequest): Refusal | null {
    return readHeaders(request) ? null : { code: 'invalid_github_headers', status: 400 };
}

function readHeaders(request: FastifyRequest) {
    const event = header(request, 'x-github-event');
    const guid = header(request, 'x-github-delivery');
    const signature = header(request, 'x-hub-signature-256');
    if (!(event && guid && signature) || guid.length > deliveryGuidMaxLength) {
        return null;
    }
    return { event, guid, signature };
}

function header(request: FastifyRequest, name: string): string | null {
    const value = request.headers[name];
    const first = (Array.isArray(value) ? value[0] : value)?.trim();
    return first ? first : null;
}

/** A JSON object body, or undefined for anything else (form encoding, arrays, garbage). */
function parseJson(body: Buffer): object | undefined {
    try {
        const parsed: unknown = JSON.parse(body.toString('utf8'));
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : undefined;
    } catch {
        return undefined;
    }
}

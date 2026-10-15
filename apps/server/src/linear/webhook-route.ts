import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { bodyRefusal } from '../triggers/trigger-route.ts';
import type { LinearIngestOutcome, LinearVerifiedDelivery } from './delivery-ingest.ts';
import { isFreshLinearDelivery, verifyLinearSignature } from './webhook-signature.ts';

/** The Haus app's workspace webhook and one Agent identity's. */
export const linearWebhookPaths = {
    identity: '/api/linear/webhook/:identityId',
    workspace: '/api/linear/webhook',
} as const;

/** Linear deliveries are small; anything over 1 MiB is refused before it is read. */
export const linearWebhookBodyLimit = 1024 * 1024;
const deliveryIdPattern = /^[A-Za-z0-9-]{1,64}$/u;
const identityIdPattern = /^lni_[A-Za-z0-9_-]{16}$/u;

/** What one identity's webhook URL verifies against. */
export interface LinearIdentityReceiver {
    appUserId: string | null;
    identityId: string;
    oauthClientId: string | null;
    organizationId: string;
    /** The current secret, plus the previous one inside its 24-hour window. */
    secrets: readonly string[];
}

export interface LinearWebhookReceivers {
    /** The Haus app's accepted secrets (current, then previous), or null when unconfigured. */
    appSecrets(): readonly string[] | null;
    /** A live identity by id; null for unknown and removed ones alike. */
    identity(identityId: string): Promise<LinearIdentityReceiver | null>;
}

export interface LinearWebhookRouteOptions {
    clock: { now(): Date };
    ingest(delivery: LinearVerifiedDelivery): Promise<LinearIngestOutcome>;
    receivers: LinearWebhookReceivers;
}

interface Refusal {
    code: string;
    status: number;
}

const invalidSignature: Refusal = { code: 'invalid_signature', status: 401 };

/**
 * `POST /api/linear/webhook` (the Haus app) and `POST /api/linear/webhook/:identityId`
 * (one Agent identity), answering in the order specs/linear-app.md#endpoints
 * lists. The body is read raw so the HMAC covers Linear's exact bytes. Every
 * verification failure, unknown identity, and removed identity answers the
 * same `401`, and an unknown organization is accepted like a bound one, so
 * neither URL reveals what is bound here.
 */
export function registerLinearWebhookRoutes(
    app: FastifyInstance,
    options: LinearWebhookRouteOptions
) {
    return app.register(async (scope) => {
        scope.removeAllContentTypeParsers();
        scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
            done(null, body);
        });
        const routeOptions = { bodyLimit: linearWebhookBodyLimit };
        scope.post(linearWebhookPaths.workspace, routeOptions, (request, reply) =>
            handle(options, request, reply, null)
        );
        scope.post<{ Params: { identityId: string } }>(
            linearWebhookPaths.identity,
            routeOptions,
            (request, reply) => handle(options, request, reply, request.params.identityId)
        );
        // Fastify refuses an oversized body before the handler runs, so the
        // earlier answers in the endpoint's order are repeated here first.
        scope.setErrorHandler((error, request, reply) => {
            const refusal = bodyRefusal(error);
            if (!refusal) {
                return reply.send(error);
            }
            const identityId = (request.params as { identityId?: string } | undefined)?.identityId;
            const earlier =
                (identityId === undefined ? configurationRefusal(options) : null) ??
                headerRefusal(request);
            const answer = earlier ?? refusal;
            return reply.code(answer.status).send({ code: answer.code });
        });
    });
}

async function handle(
    options: LinearWebhookRouteOptions,
    request: FastifyRequest,
    reply: FastifyReply,
    identityId: string | null
) {
    const unconfigured = identityId === null ? configurationRefusal(options) : null;
    if (unconfigured) {
        return send(reply, unconfigured);
    }
    const headers = readHeaders(request);
    if (!headers) {
        return send(reply, { code: 'invalid_linear_headers', status: 400 });
    }
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    if (body.byteLength > linearWebhookBodyLimit) {
        return send(reply, { code: 'payload_too_large', status: 413 });
    }
    const receiver = await resolveReceiver(options, identityId);
    const verified = verifyLinearSignature({
        body,
        header: headers.signature,
        secrets: receiver?.secrets ?? [],
    });
    if (!(receiver && verified)) {
        return send(reply, invalidSignature);
    }
    const payload = parseJsonObject(body);
    if (!payload) {
        return send(reply, { code: 'unsupported_media_type', status: 415 });
    }
    const now = options.clock.now();
    if (
        !(
            isFreshLinearDelivery(payload.webhookTimestamp, now) &&
            matchesReceiver(receiver.identity, payload)
        )
    ) {
        return send(reply, invalidSignature);
    }
    const outcome = await options.ingest({
        deliveryId: headers.deliveryId,
        event: headers.event,
        payload,
        receivedAt: now,
        receiver: receiver.identity?.identityId ?? 'app',
        webhookTimestamp: new Date(payload.webhookTimestamp as number),
    });
    return reply
        .code(200)
        .send(outcome.kind === 'duplicate' ? { duplicate: true } : { accepted: true });
}

async function resolveReceiver(
    options: LinearWebhookRouteOptions,
    identityId: string | null
): Promise<{ identity: LinearIdentityReceiver | null; secrets: readonly string[] } | null> {
    if (identityId === null) {
        const secrets = options.receivers.appSecrets();
        return secrets ? { identity: null, secrets } : null;
    }
    if (!identityIdPattern.test(identityId)) {
        return null;
    }
    const identity = await options.receivers.identity(identityId);
    return identity ? { identity, secrets: identity.secrets } : null;
}

/**
 * An identity URL only takes deliveries about that identity's own app: its
 * organization, its OAuth client, and (when the payload names one) its app
 * user. The Haus app URL routes by organization later, at ingest.
 */
function matchesReceiver(
    identity: LinearIdentityReceiver | null,
    payload: Record<string, unknown>
): boolean {
    if (!identity) {
        return true;
    }
    const appUserId = payload.appUserId;
    return (
        payload.organizationId === identity.organizationId &&
        identity.oauthClientId !== null &&
        payload.oauthClientId === identity.oauthClientId &&
        (appUserId === undefined || appUserId === null || appUserId === identity.appUserId)
    );
}

function configurationRefusal(options: LinearWebhookRouteOptions): Refusal | null {
    const secrets = options.receivers.appSecrets();
    return secrets && secrets.length > 0 ? null : { code: 'linear_app_unconfigured', status: 503 };
}

function headerRefusal(request: FastifyRequest): Refusal | null {
    return readHeaders(request) ? null : { code: 'invalid_linear_headers', status: 400 };
}

function readHeaders(request: FastifyRequest) {
    const signature = header(request, 'linear-signature');
    const event = header(request, 'linear-event');
    const deliveryId = header(request, 'linear-delivery');
    if (!(signature && event && deliveryId && deliveryIdPattern.test(deliveryId))) {
        return null;
    }
    return { deliveryId, event, signature };
}

function header(request: FastifyRequest, name: string): string | null {
    const value = request.headers[name];
    const first = (Array.isArray(value) ? value[0] : value)?.trim();
    return first ? first : null;
}

/** A JSON object body, or null for anything else (arrays, form encoding, garbage). */
function parseJsonObject(body: Buffer): Record<string, unknown> | null {
    try {
        const parsed: unknown = JSON.parse(body.toString('utf8'));
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

function send(reply: FastifyReply, refusal: Refusal) {
    return reply.code(refusal.status).send({ code: refusal.code });
}

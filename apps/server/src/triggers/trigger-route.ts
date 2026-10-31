import { triggerDedupeKeyMaxLength, triggerPayloadMaxBytes } from '@haus/api';
import type { EffectRuntime } from '@haus/effect';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { authenticateTrigger, findTriggerFireByDedupeKey, fireTrigger } from './trigger-fire.ts';
import { readBearerSecret, type TriggerClock } from './trigger-model.ts';
import { TriggerRateLimiter } from './trigger-rate-limit.ts';

/** PostgreSQL text cannot hold a NUL, so a body carrying one is not storable text. */
const NUL = String.fromCharCode(0);
/** Refuse well past the stored ceiling so the handler owns the 413, not Fastify. */
const routeBodyLimit = triggerPayloadMaxBytes * 4;

export interface TriggerRouteOptions {
    clock?: TriggerClock;
    db: HausDatabase;
    delivery: AgentDelivery;
    limiter?: TriggerRateLimiter;
    postCommitWork: ServerPostCommitWork;
    runtime: EffectRuntime<never>;
}

/**
 * The public inbound edge. No Haus session or Computer: an outside system
 * proves one trigger's bearer secret and the Server records the delivery. The
 * body is captured raw for every content type — it is stored and relayed
 * verbatim, and the Server never parses it for meaning.
 */
export function registerTriggerRoutes(app: FastifyInstance, options: TriggerRouteOptions) {
    const clock = options.clock ?? { now: () => new Date() };
    const limiter = options.limiter ?? new TriggerRateLimiter();

    return app.register(async (scope) => {
        scope.removeAllContentTypeParsers();
        scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
            done(null, body);
        });
        scope.post<{ Params: { triggerId: string } }>(
            '/api/triggers/:triggerId',
            { bodyLimit: routeBodyLimit },
            (request, reply) => handleTriggerRequest(options, limiter, clock, request, reply)
        );
        // Only Fastify's own body-reading failures get a trigger refusal: a
        // body it could not read is a body we cannot store. Anything else is a
        // Server fault and belongs to the default handler, which logs it and
        // answers 500 without leaking the cause.
        scope.setErrorHandler((error, request, reply) => {
            const refusal = bodyRefusal(error);
            if (!refusal) {
                return reply.send(error);
            }
            request.log.info({ err: error }, 'trigger delivery body refused');
            return refuse(reply, refusal.status, refusal.code);
        });
    });
}

type TriggerHttpRequest = FastifyRequest<{ Params: { triggerId: string } }>;

async function handleTriggerRequest(
    options: TriggerRouteOptions,
    limiter: TriggerRateLimiter,
    clock: TriggerClock,
    request: TriggerHttpRequest,
    reply: FastifyReply
) {
    const parsed = readTriggerDelivery(request);
    if (parsed.kind === 'refusal') {
        return refuse(reply, parsed.status, parsed.code);
    }
    const authorized = await authorizeTriggerDelivery(options, limiter, clock, request, parsed);
    if (authorized.kind === 'refusal') {
        if (authorized.retryAfterSeconds) {
            reply.header('retry-after', String(authorized.retryAfterSeconds));
        }
        return refuse(reply, authorized.status, authorized.code);
    }
    if (authorized.kind === 'replay') {
        return reply.code(200).send({
            duplicate: true,
            fireId: authorized.fireId,
            triggerId: authorized.triggerId,
            type: 'trigger_fire',
        });
    }
    const outcome = await fireTrigger(options.db, options, authorized.request, clock);
    if (outcome.status === 'refused') {
        return refuse(reply, outcome.code === 'unauthorized' ? 401 : 409, outcome.code);
    }
    return reply.code(outcome.status === 'duplicate' ? 200 : 202).send({
        ...(outcome.status === 'duplicate' ? { duplicate: true } : {}),
        fireId: outcome.fireId,
        triggerId: outcome.triggerId,
        type: 'trigger_fire',
    });
}

type ParsedTriggerDelivery =
    | { code: string; kind: 'refusal'; status: number }
    | {
          contentType: string | null;
          dedupeKey: string | null;
          kind: 'parsed';
          payload: string;
          secret: string;
      };

function readTriggerDelivery(request: TriggerHttpRequest): ParsedTriggerDelivery {
    const secret = readBearerSecret(request.headers.authorization);
    if (!secret) {
        return { code: 'unauthorized', kind: 'refusal', status: 401 };
    }
    const body = readPayload(request);
    if (body.refusal) {
        return { code: body.refusal, kind: 'refusal', status: body.status };
    }
    const dedupeKey = readDedupeKey(request);
    if (dedupeKey === 'invalid') {
        return { code: 'invalid_idempotency_key', kind: 'refusal', status: 400 };
    }
    return {
        contentType: readContentType(request),
        dedupeKey,
        kind: 'parsed',
        payload: body.payload,
        secret,
    };
}

type AuthorizedTriggerDelivery =
    | { code: string; kind: 'refusal'; retryAfterSeconds?: number; status: number }
    | { fireId: string; kind: 'replay'; triggerId: string }
    | { kind: 'ready'; request: Parameters<typeof fireTrigger>[2] };

async function authorizeTriggerDelivery(
    options: TriggerRouteOptions,
    limiter: TriggerRateLimiter,
    clock: TriggerClock,
    request: TriggerHttpRequest,
    parsed: Exclude<ParsedTriggerDelivery, { kind: 'refusal' }>
): Promise<AuthorizedTriggerDelivery> {
    const trigger = await authenticateTrigger(options.db, {
        secret: parsed.secret,
        triggerId: request.params.triggerId,
    });
    if (!trigger) {
        return { code: 'unauthorized', kind: 'refusal', status: 401 };
    }
    // A recorded replay is not new traffic, so it spends no rate-limit budget.
    const replayed = await findTriggerFireByDedupeKey(options.db, {
        dedupeKey: parsed.dedupeKey,
        serverId: trigger.serverId,
        triggerId: trigger.id,
    });
    if (replayed) {
        return { fireId: replayed, kind: 'replay', triggerId: trigger.id };
    }
    // Disabled triggers are still metered so callers cannot hammer one for free.
    const limited = limiter.admit(trigger.id, clock.now().getTime());
    if (limited) {
        return {
            code: 'rate_limited',
            kind: 'refusal',
            retryAfterSeconds: limited.retryAfterSeconds,
            status: 429,
        };
    }
    if (trigger.status === 'disabled') {
        return { code: 'trigger_disabled', kind: 'refusal', status: 409 };
    }
    return {
        kind: 'ready',
        request: {
            contentType: parsed.contentType,
            dedupeKey: parsed.dedupeKey,
            payload: parsed.payload,
            trigger,
        },
    };
}

function refuse(reply: FastifyReply, status: number, code: string) {
    return reply.code(status).send({ code });
}

/**
 * Maps one Fastify body-reading failure to its trigger refusal, or null when
 * the failure has nothing to do with the request body.
 */
export function bodyRefusal(
    error: unknown
):
    | { code: 'payload_too_large'; status: 413 }
    | { code: 'unsupported_media_type'; status: 415 }
    | null {
    const { code, statusCode } = (error ?? {}) as { code?: string; statusCode?: number };
    if (statusCode === 413 || code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
        return { code: 'payload_too_large', status: 413 };
    }
    // Every other content-type-parser failure is a body Fastify could not read.
    return code?.startsWith('FST_ERR_CTP_')
        ? { code: 'unsupported_media_type', status: 415 }
        : null;
}

/**
 * Reads the raw body as UTF-8 text. Binary bodies — anything that is not valid
 * UTF-8, NUL included, since PostgreSQL text cannot hold it — are refused rather
 * than mangled.
 */
function readPayload(
    request: FastifyRequest
):
    | { payload: string; refusal: null; status: 200 }
    | { payload: ''; refusal: 'payload_too_large'; status: 413 }
    | { payload: ''; refusal: 'unsupported_media_type'; status: 415 } {
    const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    if (raw.byteLength > triggerPayloadMaxBytes) {
        return { payload: '', refusal: 'payload_too_large', status: 413 };
    }
    try {
        const payload = new TextDecoder('utf-8', { fatal: true }).decode(raw);
        return payload.includes(NUL)
            ? { payload: '', refusal: 'unsupported_media_type', status: 415 }
            : { payload, refusal: null, status: 200 };
    } catch {
        return { payload: '', refusal: 'unsupported_media_type', status: 415 };
    }
}

function readDedupeKey(request: FastifyRequest): string | null | 'invalid' {
    const header = request.headers['idempotency-key'];
    const value = (Array.isArray(header) ? header[0] : header)?.trim();
    if (!value) {
        return null;
    }
    return value.length > triggerDedupeKeyMaxLength ? 'invalid' : value;
}

function readContentType(request: FastifyRequest): string | null {
    const header = request.headers['content-type'];
    const value = (Array.isArray(header) ? header[0] : header)?.trim();
    return value && value.length > 0 ? value : null;
}

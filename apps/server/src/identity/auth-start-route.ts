import { randomBytes } from 'node:crypto';
import { lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import { browserAuthIntentsTable, nativeAuthIntentsTable } from '../postgres/schema.ts';
import {
    type AuthRouteDependencies,
    authIntentLifetimeMs,
    replyAuthError,
    setStateCookie,
} from './auth-http.ts';
import {
    cloudflareAccessIssuer,
    cloudflareAuthRedirectUri,
    cloudflareAuthResource,
    cloudflareNativeClientId,
} from './cloudflare-access.ts';
import { createCloudflareOAuthMetadataReader } from './cloudflare-oauth-metadata.ts';
import { hashHausToken } from './haus-sessions.ts';

const nativeStartSchema = z
    .object({
        client: z.enum(['desktop', 'ios']),
        codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
        redirectUri: z.string().min(1).max(1024),
        state: z
            .string()
            .min(1)
            .max(512)
            .regex(/^[^\u0000-\u001f\u007f]+$/u),
        switchAccount: z.enum(['true', 'false']).optional(),
    })
    .strict();
const browserStartSchema = z
    .object({
        returnTo: z.string().max(2048).optional(),
        switchAccount: z.enum(['true', 'false']).optional(),
    })
    .strict();

export function registerAuthStartRoute(app: FastifyInstance, dependencies: AuthRouteDependencies) {
    const metadata = createCloudflareOAuthMetadataReader({
        ...(dependencies.cloudflareOAuthMetadataFetch
            ? { fetch: dependencies.cloudflareOAuthMetadataFetch }
            : {}),
        issuer: cloudflareAccessIssuer,
    });

    app.get('/auth/config', async (_request, reply) => {
        reply.header('cache-control', 'no-store');
        return reply.send({
            clientId: cloudflareNativeClientId,
            issuer: cloudflareAccessIssuer,
            redirectUri: cloudflareAuthRedirectUri,
            resource: cloudflareAuthResource,
        });
    });

    app.get('/auth/start', async (request, reply) => {
        const raw = request.query;
        const native = nativeStartSchema.safeParse(raw);
        if (native.success) {
            return await startNativeAuth(reply, dependencies, metadata, native.data);
        }
        const browser = browserStartSchema.safeParse(raw);
        if (!browser.success) {
            return reply
                .code(400)
                .send({ error: 'auth_required', message: 'Invalid sign-in request.' });
        }
        return await startBrowserAuth(reply, dependencies, browser.data.returnTo);
    });
}

async function startBrowserAuth(
    reply: import('fastify').FastifyReply,
    dependencies: AuthRouteDependencies,
    returnTo: string | undefined
) {
    const safeReturnTo = validateLocalReturnTo(returnTo, dependencies.appOrigin);
    if (!safeReturnTo) {
        return reply.code(400).send({ error: 'auth_required', message: 'Invalid return route.' });
    }
    const state = randomBytes(32).toString('base64url');
    const now = new Date();
    await dependencies.hausDb.transaction(async (tx) => {
        await tx.delete(browserAuthIntentsTable).where(lt(browserAuthIntentsTable.expiresAt, now));
        await tx.insert(browserAuthIntentsTable).values({
            expiresAt: new Date(now.getTime() + authIntentLifetimeMs),
            returnTo: safeReturnTo,
            stateHash: hashHausToken(state),
        });
    });
    setStateCookie(reply, dependencies.appOrigin, state);
    const destination = new URL('/auth/complete', dependencies.appOrigin);
    destination.searchParams.set('state', state);
    reply.header('cache-control', 'no-store');
    return reply.code(303).redirect(destination.toString());
}

async function startNativeAuth(
    reply: import('fastify').FastifyReply,
    dependencies: AuthRouteDependencies,
    metadataReader: ReturnType<typeof createCloudflareOAuthMetadataReader>,
    input: z.infer<typeof nativeStartSchema>
) {
    const allowLoopback = dependencies.developmentAuth !== null && input.client === 'desktop';
    if (!isAllowedNativeRedirectUri(input.redirectUri, input.client, allowLoopback)) {
        return reply
            .code(400)
            .send({ error: 'auth_required', message: 'Invalid native callback.' });
    }
    let metadata: Awaited<ReturnType<typeof metadataReader.read>>;
    try {
        metadata = await metadataReader.read();
    } catch (cause) {
        return replyAuthError(reply, cause);
    }

    const serverState = randomBytes(32).toString('base64url');
    const now = new Date();
    await dependencies.hausDb.transaction(async (tx) => {
        await tx.delete(nativeAuthIntentsTable).where(lt(nativeAuthIntentsTable.expiresAt, now));
        await tx.insert(nativeAuthIntentsTable).values({
            client: input.client,
            codeChallenge: input.codeChallenge,
            expiresAt: new Date(now.getTime() + authIntentLifetimeMs),
            nativeRedirectUri: input.redirectUri,
            nativeState: input.state,
            stateHash: hashHausToken(serverState),
        });
    });

    const authorize = new URL(metadata.authorization_endpoint);
    authorize.searchParams.set('client_id', cloudflareNativeClientId);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('redirect_uri', cloudflareAuthRedirectUri);
    authorize.searchParams.set('resource', cloudflareAuthResource);
    authorize.searchParams.set('scope', 'openid email profile');
    authorize.searchParams.set('state', serverState);
    authorize.searchParams.set('code_challenge', input.codeChallenge);
    authorize.searchParams.set('code_challenge_method', 'S256');
    reply.header('cache-control', 'no-store');
    return reply.code(302).redirect(authorize.toString());
}

export function validateLocalReturnTo(value: string | undefined, appOrigin: string) {
    const candidate = value ?? '/';
    if (
        !candidate.startsWith('/') ||
        candidate.startsWith('//') ||
        candidate.includes('\\') ||
        /[\u0000-\u001f\u007f]/u.test(candidate)
    ) {
        return null;
    }
    try {
        const destination = new URL(candidate, appOrigin);
        if (destination.origin !== new URL(appOrigin).origin) {
            return null;
        }
        return `${destination.pathname}${destination.search}${destination.hash}`;
    } catch {
        return null;
    }
}

export function isAllowedNativeRedirectUri(
    value: string,
    client: 'desktop' | 'ios',
    allowLoopback: boolean
) {
    if (value === 'haus://sso-callback') {
        return true;
    }
    if (!(allowLoopback && client === 'desktop')) {
        return false;
    }
    try {
        const callback = new URL(value);
        return (
            callback.protocol === 'http:' &&
            callback.hostname === '127.0.0.1' &&
            validPort(callback.port) &&
            callback.username === '' &&
            callback.password === '' &&
            callback.search === '' &&
            callback.hash === '' &&
            /^\/sso-callback\/[0-9a-f]{48}$/u.test(callback.pathname)
        );
    } catch {
        return false;
    }
}

function validPort(value: string) {
    if (!/^\d+$/u.test(value)) {
        return false;
    }
    const port = Number(value);
    return Number.isInteger(port) && port > 0 && port <= 65_535;
}

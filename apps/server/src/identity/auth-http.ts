import type { FastifyReply, FastifyRequest } from 'fastify';
import type { HausDatabase } from '../postgres/connection.ts';
import type { CloudflareAdmissions } from './cloudflare-access.ts';
import { CloudflareAdmissionUnavailableError } from './cloudflare-access.ts';
import { CloudflareOAuthMetadataError } from './cloudflare-oauth-metadata.ts';
import type { HausSessions } from './haus-sessions.ts';
import { HausAuthError } from './haus-sessions.ts';
import {
    HumanIdentityEmailMismatchError,
    HumanIdentityNotLinkedError,
} from './human-identities.ts';
import type { SessionConnections } from './session-connections.ts';

export interface AuthRouteDependencies {
    appOrigin: string;
    cloudflareAdmissions: CloudflareAdmissions;
    cloudflareOAuthMetadataFetch?: typeof fetch;
    developmentAuth: { identitySubject: string; userId: string } | null;
    hausDb: HausDatabase;
    hausSessions: HausSessions;
    sessionConnections: SessionConnections;
}

export const authResumeCookieName = '__Host-haus_resume';
export const authStateCookieName = '__Host-haus_auth_state';
export const authIntentLifetimeMs = 10 * 60 * 1000;

export function resumeCookieName(appOrigin: string) {
    return cookieName(authResumeCookieName, appOrigin);
}

export function stateCookieName(appOrigin: string) {
    return cookieName(authStateCookieName, appOrigin);
}

export function requestHeader(request: FastifyRequest, name: string) {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
}

export function readCookie(request: FastifyRequest, name: string) {
    const cookie = requestHeader(request, 'cookie');
    if (!cookie) {
        return null;
    }
    for (const part of cookie.split(';')) {
        const [key, ...value] = part.trim().split('=');
        if (key === name) {
            try {
                return decodeURIComponent(value.join('='));
            } catch {
                return null;
            }
        }
    }
    return null;
}

export function hasSameOriginProvenance(request: FastifyRequest, appOrigin: string) {
    if (requestHeader(request, 'x-haus-session-request') !== '1') {
        return false;
    }
    const origin = requestHeader(request, 'origin');
    if (origin) {
        try {
            if (new URL(origin).origin !== new URL(appOrigin).origin) {
                return false;
            }
        } catch {
            return false;
        }
    }
    const fetchSite = requestHeader(request, 'sec-fetch-site');
    return fetchSite === undefined || fetchSite === 'same-origin' || fetchSite === 'none';
}

export function isLoopbackRequest(request: FastifyRequest) {
    const host = requestHeader(request, 'host');
    const hostname = host ? parseHost(host) : null;
    const remoteAddress = request.raw.socket.remoteAddress;
    return (
        (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') &&
        (remoteAddress === '127.0.0.1' ||
            remoteAddress === '::1' ||
            remoteAddress === '::ffff:127.0.0.1')
    );
}

export function setResumeCookie(
    reply: FastifyReply,
    appOrigin: string,
    token: string,
    expiresAt: string
) {
    const secure = new URL(appOrigin).protocol === 'https:';
    const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
    appendSetCookie(
        reply,
        `${cookieName(authResumeCookieName, appOrigin)}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
    );
}

export function clearResumeCookie(reply: FastifyReply, appOrigin: string) {
    const secure = new URL(appOrigin).protocol === 'https:';
    appendSetCookie(
        reply,
        `${cookieName(authResumeCookieName, appOrigin)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
    );
}

export function setStateCookie(reply: FastifyReply, appOrigin: string, state: string) {
    const secure = new URL(appOrigin).protocol === 'https:';
    appendSetCookie(
        reply,
        `${cookieName(authStateCookieName, appOrigin)}=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.ceil(authIntentLifetimeMs / 1000)}${secure ? '; Secure' : ''}`
    );
}

export function clearStateCookie(reply: FastifyReply, appOrigin: string) {
    const secure = new URL(appOrigin).protocol === 'https:';
    appendSetCookie(
        reply,
        `${cookieName(authStateCookieName, appOrigin)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
    );
}

export function replyAuthError(reply: FastifyReply, cause: unknown) {
    reply.header('cache-control', 'no-store');
    if (cause instanceof HausAuthError) {
        const statusCode = cause.code === 'auth_unavailable' ? 503 : 401;
        return reply.code(statusCode).send({ error: cause.code, message: cause.message });
    }
    if (cause instanceof CloudflareAdmissionUnavailableError) {
        return reply.code(503).send({ error: 'auth_unavailable', message: cause.message });
    }
    if (cause instanceof CloudflareOAuthMetadataError) {
        return reply.code(503).send({ error: 'auth_unavailable', message: cause.message });
    }
    if (
        cause instanceof HumanIdentityEmailMismatchError ||
        cause instanceof HumanIdentityNotLinkedError
    ) {
        return reply.code(403).send({
            error: 'auth_required',
            message: 'This account does not have access to Haus.',
        });
    }
    return reply
        .code(401)
        .send({ error: 'auth_required', message: 'Sign in to use this Haus server.' });
}

function parseHost(value: string) {
    try {
        return new URL(`http://${value}`).hostname.replace(/^\[|\]$/gu, '');
    } catch {
        return null;
    }
}

function cookieName(name: string, appOrigin: string) {
    const origin = new URL(appOrigin);
    if (origin.protocol === 'https:') {
        return name;
    }
    const port = origin.port || (origin.protocol === 'http:' ? '80' : '0');
    return `${name.slice('__Host-'.length)}_${port}`;
}

function appendSetCookie(reply: FastifyReply, value: string) {
    const current = reply.getHeader('set-cookie');
    const values = Array.isArray(current) ? current.map(String) : current ? [String(current)] : [];
    reply.header('set-cookie', [...values, value]);
}

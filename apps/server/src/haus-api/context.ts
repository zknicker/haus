import { appProtocolHeaders } from '@haus/api';
import type { EffectRuntime } from '@haus/effect';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { ArtifactThumbnails } from '../artifacts/thumbnails.ts';
import type { AttachmentRoot } from '../attachments/attachment-root.ts';
import type { AvatarImageService } from '../avatar-generation/service.ts';
import type { ComputerConnections } from '../computers/connections.ts';
import type { GithubApp } from '../github/github-app.ts';
import type { CloudflareAdmissions } from '../identity/cloudflare-access.ts';
import type { HausSessions } from '../identity/haus-sessions.ts';
import type { SessionConnections } from '../identity/session-connections.ts';
import type { LinearRuntime } from '../linear/linear-runtime.ts';
import type { MessageRouter } from '../message-routing/jev.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { McpIconResolver } from '../server-mcp/icons.ts';
import type { McpOAuthRelay } from '../server-mcp/oauth-relay.ts';
import type { McpRuntime } from '../server-mcp/runtime.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import type { TriggerRateLimiter } from '../triggers/trigger-rate-limit.ts';
import { publicOrigin } from '../triggers/trigger-url.ts';
import type { SocketSession } from './socket-session.ts';

/**
 * Request context for the Haus Server. It carries the Haus App session
 * for this request only — never process-shared identity — plus the Server's
 * PostgreSQL database.
 */
export interface HausContext {
    /** Server-owned durable Agent delivery: pending inbox, runs, and Stop state. */
    agentDelivery: AgentDelivery;
    appOrigin: string;
    /** App provenance and exact wire-contract declaration for this request. */
    appProtocol: { productVersion: string | null; protocolVersion: number | null };
    artifactStorage: ArtifactStorage | null;
    artifactStorageBytes: number;
    /** WebP thumbnails for raster revisions; null without artifact storage. */
    artifactThumbnails: ArtifactThumbnails | null;
    attachmentRoot: AttachmentRoot;
    avatarImageService: AvatarImageService;
    cloudflareAdmissions: CloudflareAdmissions;
    /** Live attachment sockets for MCP configuration delivery. */
    computerConnections: ComputerConnections;
    computerReleaseManifestUrl: string;
    developmentAuth: { identitySubject: string; userId: string } | null;
    /** The Haus GitHub App, or null when its credentials are not configured. */
    githubApp: GithubApp | null;
    hausDb: HausDatabase;
    hausSessions: HausSessions;
    /** HTTP response handle for ending SSE subscriptions on local sign-out. */
    httpSessionConnection: HttpSessionConnection | null;
    /** The Linear app (or null), its single refresh owner, and the tool transport. */
    linear: LinearRuntime;
    mcpIconResolver: McpIconResolver;
    mcpOAuthRelay: McpOAuthRelay;
    mcpRuntime: McpRuntime;
    messageRouter?: MessageRouter;
    postCommitWork: ServerPostCommitWork;
    /** HTTP Host header, used only to constrain localhost development procedures. */
    requestHost: string | null;
    /**
     * The public origin this request reached the Server on, read from the same
     * forwarded headers the Agent routes use. Trigger URLs are derived from it
     * rather than from configuration, so an operator and an Agent name the same
     * address.
     */
    requestOrigin: string;
    runtime: EffectRuntime<never>;
    sessionConnections: SessionConnections;
    sessionId: string | null;
    /** Haus access token from Authorization or tRPC connectionParams. */
    sessionToken: string | null;
    /**
     * The App WebSocket's live Haus session, when this operation rides one.
     * Its token supersedes `sessionToken` (the opening token) once the App
     * refreshes it in place. Null for HTTP requests.
     */
    socketSession: SocketSession | null;
    /** The one in-memory inbound fire budget, shared by the public route and test fires. */
    triggerRateLimiter: TriggerRateLimiter;
    /** Present only after `humanProcedure` authenticates an opaque App access token. */
    userId: string | null;
}

export interface HausContextDependencies {
    agentDelivery: AgentDelivery;
    appOrigin: string;
    artifactStorage: ArtifactStorage | null;
    artifactStorageBytes: number;
    /** WebP thumbnails for raster revisions; null without artifact storage. */
    artifactThumbnails: ArtifactThumbnails | null;
    attachmentRoot: AttachmentRoot;
    avatarImageService: AvatarImageService;
    cloudflareAdmissions: CloudflareAdmissions;
    computerConnections: ComputerConnections;
    computerReleaseManifestUrl: string;
    developmentAuth: { identitySubject: string; userId: string } | null;
    githubApp: GithubApp | null;
    hausDb: HausDatabase;
    hausSessions: HausSessions;
    /** The Linear app (or null), its single refresh owner, and the tool transport. */
    linear: LinearRuntime;
    mcpIconResolver: McpIconResolver;
    mcpOAuthRelay: McpOAuthRelay;
    mcpRuntime: McpRuntime;
    messageRouter?: MessageRouter;
    postCommitWork: ServerPostCommitWork;
    runtime: EffectRuntime<never>;
    sessionConnections: SessionConnections;
    triggerRateLimiter: TriggerRateLimiter;
}

interface ContextCarrier {
    info?: { connectionParams?: Record<string, string | undefined> | null } | null;
    req?: {
        headers?: Record<string, string | string[] | undefined>;
        /** Fastify resolves this per connection; a WebSocket upgrade carries none. */
        protocol?: string;
    } | null;
    res?: { raw?: HttpRawResponse } | null;
}

interface HttpRawResponse {
    end(): void;
    off(event: 'close' | 'finish', listener: () => void): void;
    once(event: 'close' | 'finish', listener: () => void): void;
}

export function createHausContextFactory(dependencies: HausContextDependencies) {
    return (opts?: ContextCarrier): HausContext => ({
        ...dependencies,
        appProtocol: readAppProtocol(opts),
        sessionToken: readHausSessionToken(opts),
        requestHost: readRequestHost(opts),
        requestOrigin: publicOrigin({
            headers: opts?.req?.headers,
            protocol: opts?.req?.protocol,
        }),
        socketSession: null,
        userId: null,
        httpSessionConnection: readHttpSessionConnection(opts),
        sessionId: null,
    });
}

function readAppProtocol(opts?: ContextCarrier) {
    const connection = opts?.info?.connectionParams;
    const headers = opts?.req?.headers;
    const productVersion =
        connection?.productVersion ?? readHeader(headers, appProtocolHeaders.productVersion);
    const rawProtocolVersion =
        connection?.appProtocolVersion ?? readHeader(headers, appProtocolHeaders.protocolVersion);
    const protocolVersion =
        typeof rawProtocolVersion === 'string' && /^\d+$/u.test(rawProtocolVersion)
            ? Number(rawProtocolVersion)
            : null;

    return {
        productVersion:
            typeof productVersion === 'string' && productVersion ? productVersion : null,
        protocolVersion,
    };
}

function readHeader(
    headers: Record<string, string | string[] | undefined> | undefined,
    name: string
) {
    const value = headers?.[name];
    return Array.isArray(value) ? value[0] : value;
}

function readHausSessionToken(opts?: ContextCarrier) {
    const fromConnection = opts?.info?.connectionParams?.sessionToken;

    if (typeof fromConnection === 'string' && fromConnection.length > 0) {
        return fromConnection;
    }

    const header = opts?.req?.headers?.authorization;
    const value = Array.isArray(header) ? header[0] : header;

    return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7) : null;
}

export interface HttpSessionConnection {
    end(): void;
    onClose(listener: () => void): () => void;
}

function readHttpSessionConnection(opts?: ContextCarrier): HttpSessionConnection | null {
    const raw = opts?.res && 'raw' in opts.res ? opts.res.raw : null;
    if (!raw) {
        return null;
    }
    return {
        end: () => raw.end(),
        onClose(listener) {
            raw.once('close', listener);
            raw.once('finish', listener);
            return () => {
                raw.off('close', listener);
                raw.off('finish', listener);
            };
        },
    };
}

function readRequestHost(opts?: ContextCarrier) {
    return readHeader(opts?.req?.headers, 'host') ?? null;
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import {
    type LinearCallMeta,
    linearUploadMaxBytes,
    linearUploadMediaTypes,
} from '@haus/api/linear-actor-meta';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { artifactRevisionsTable, artifactsTable } from '../postgres/schema.ts';

// Short-lived signed URLs the connector and Linear fetch without a session
// (specs/linear-app.md#signed-urls). HMAC-SHA256 with
// `HAUS_LINEAR_URL_SIGNING_KEY` over a purpose, the path claim, and the expiry,
// so a token minted for one route never verifies on another.

/** Linear fetches `displayIconUrl` once and rehosts it. */
export const linearAvatarTtlMs = 15 * 60_000;
/** Covers the longest call deadline the connector accepts. */
export const linearUploadTtlMs = 2 * 60_000;

export const linearAvatarRoute = '/api/linear/avatar/:agentId/:exp/:sig';
export const linearUploadSourceRoute = '/api/linear/artifact/:token';

/** `displayIconUrl` for one Agent: its current avatar, for fifteen minutes. */
export function mintLinearAvatarUrl(
    options: { origin: string; signingKey: string },
    agentId: string,
    now = Date.now()
): string {
    const exp = Math.floor((now + linearAvatarTtlMs) / 1000);
    const sig = sign(options.signingKey, 'avatar', `${agentId}.${exp}`);
    return new URL(
        `/api/linear/avatar/${encodeURIComponent(agentId)}/${exp}/${sig}`,
        options.origin
    ).toString();
}

export function verifyLinearAvatarPath(
    signingKey: string,
    params: { agentId: string; exp: string; sig: string },
    now = Date.now()
): boolean {
    const exp = Number(params.exp);
    return (
        /^\d{1,12}$/u.test(params.exp) &&
        exp * 1000 > now &&
        verify(signingKey, 'avatar', `${params.agentId}.${params.exp}`, params.sig)
    );
}

export interface LinearUploadClaim {
    artifactId: string;
    /** Expiry in epoch seconds. */
    exp: number;
    revisionId: string;
    serverId: string;
}

export function signLinearUploadToken(
    signingKey: string,
    claim: Omit<LinearUploadClaim, 'exp'>,
    now = Date.now()
): string {
    const full: LinearUploadClaim = {
        artifactId: claim.artifactId,
        exp: Math.floor((now + linearUploadTtlMs) / 1000),
        revisionId: claim.revisionId,
        serverId: claim.serverId,
    };
    const body = Buffer.from(JSON.stringify(full)).toString('base64url');
    return `${body}.${sign(signingKey, 'upload', body)}`;
}

export function verifyLinearUploadToken(
    signingKey: string,
    token: string,
    now = Date.now()
): LinearUploadClaim | null {
    const [body, sig, extra] = token.split('.');
    if (!(body && sig) || extra !== undefined || !verify(signingKey, 'upload', body, sig)) {
        return null;
    }
    try {
        const claim = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown;
        if (
            typeof claim !== 'object' ||
            claim === null ||
            !(
                'exp' in claim &&
                'artifactId' in claim &&
                'revisionId' in claim &&
                'serverId' in claim
            )
        ) {
            return null;
        }
        const { artifactId, exp, revisionId, serverId } = claim;
        if (
            typeof exp !== 'number' ||
            exp * 1000 <= now ||
            typeof artifactId !== 'string' ||
            typeof revisionId !== 'string' ||
            typeof serverId !== 'string'
        ) {
            return null;
        }
        return { artifactId, exp, revisionId, serverId };
    } catch {
        return null;
    }
}

/** `upload_image` refused its artifact: missing, deleted, wrong type, or too large. */
export class LinearArtifactUnavailableError extends Error {
    readonly code = 'linear_artifact_unavailable';
    constructor(detail: string) {
        super(`linear_artifact_unavailable: ${detail}`);
        this.name = 'LinearArtifactUnavailableError';
    }
}

export interface LinearUploadRevision {
    artifactId: string;
    byteSize: number;
    contentType: (typeof linearUploadMediaTypes)[number];
    filename: string;
    objectKey: string;
    revisionId: string;
    serverId: string;
}

/** One ready revision of a live artifact on the Server, checked as an uploadable image. */
export async function checkLinearUploadRevision(
    db: Pick<HausDatabase, 'select'>,
    input: { artifactId: string; revisionId?: string; serverId: string }
): Promise<LinearUploadRevision> {
    const [row] = await db
        .select({
            byteSize: artifactRevisionsTable.byteSize,
            contentType: artifactRevisionsTable.contentType,
            filename: artifactRevisionsTable.filename,
            objectKey: artifactRevisionsTable.objectKey,
            revisionId: artifactRevisionsTable.id,
        })
        .from(artifactsTable)
        .innerJoin(
            artifactRevisionsTable,
            and(
                eq(artifactRevisionsTable.serverId, artifactsTable.serverId),
                eq(artifactRevisionsTable.artifactId, artifactsTable.id)
            )
        )
        .where(
            and(
                eq(artifactsTable.serverId, input.serverId),
                eq(artifactsTable.id, input.artifactId),
                isNull(artifactsTable.deletedAt),
                eq(artifactRevisionsTable.state, 'ready'),
                input.revisionId
                    ? eq(artifactRevisionsTable.id, input.revisionId)
                    : eq(artifactRevisionsTable.id, artifactsTable.currentRevisionId)
            )
        )
        .limit(1);
    if (!row) {
        throw new LinearArtifactUnavailableError('That file or revision was not found.');
    }
    const contentType = linearUploadMediaTypes.find((type) => type === row.contentType);
    if (!contentType) {
        throw new LinearArtifactUnavailableError('Only PNG, JPEG, GIF, or WebP images upload.');
    }
    if (row.byteSize < 1 || row.byteSize > linearUploadMaxBytes) {
        throw new LinearArtifactUnavailableError('Images upload up to 10 MiB.');
    }
    return { ...row, artifactId: input.artifactId, contentType, serverId: input.serverId };
}

/**
 * The `_meta` an `upload_image` call needs: a checked revision behind a signed
 * source URL. Other tools add nothing.
 */
export async function linearUploadMeta(
    db: Pick<HausDatabase, 'select'>,
    options: { origin: string; signingKey: string },
    write: { arguments: Record<string, unknown>; serverId: string; tool: string },
    now = Date.now()
): Promise<{ upload: NonNullable<LinearCallMeta['upload']> } | undefined> {
    if (write.tool !== 'upload_image') {
        return undefined;
    }
    const { artifactId, revisionId } = write.arguments;
    if (
        typeof artifactId !== 'string' ||
        !(revisionId === undefined || typeof revisionId === 'string')
    ) {
        throw new LinearArtifactUnavailableError('Name the file by its Haus Files id.');
    }
    const revision = await checkLinearUploadRevision(db, {
        artifactId,
        revisionId,
        serverId: write.serverId,
    });
    const token = signLinearUploadToken(options.signingKey, revision, now);
    return {
        upload: {
            contentType: revision.contentType,
            filename: revision.filename,
            size: revision.byteSize,
            url: new URL(`/api/linear/artifact/${token}`, options.origin).toString(),
        },
    };
}

function sign(key: string, purpose: string, value: string): string {
    return createHmac('sha256', key).update(`${purpose}\n${value}`).digest('base64url');
}

function verify(key: string, purpose: string, value: string, signature: string): boolean {
    const expected = Buffer.from(sign(key, purpose, value));
    const actual = Buffer.from(signature);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

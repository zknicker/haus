import type { DriveAreaCounters } from '@haus/api';
import {
    driveChangesResponseSchema,
    driveDownloadResponseSchema,
    driveErrorResponseSchema,
    driveHeadResponseSchema,
    drivePushCloseResponseSchema,
    drivePushOutcomeResponseSchema,
} from './drive-response-schema.ts';
import { sha256File } from './folder-files.ts';

const jsonTimeoutMs = 30_000;
const transferTimeoutMs = 600_000;

export class DriveRemoteError extends Error {
    readonly code: string;
    readonly status: number;

    constructor(code: string, status: number, message: string) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

export function driveRemote(input: {
    serverOrigin: string;
    signal?: AbortSignal;
    token: string | (() => Promise<string>);
}) {
    const bearer = async () =>
        `Bearer ${typeof input.token === 'string' ? input.token : await input.token()}`;
    const call = async (
        path: string,
        init: { body?: Blob | string; method?: string; type?: string } = {},
        timeoutMs = jsonTimeoutMs
    ) => {
        const response = await fetch(new URL(path, input.serverOrigin), {
            body: init.body,
            headers: {
                authorization: await bearer(),
                ...(init.type ? { 'content-type': init.type } : {}),
            },
            method: init.method ?? 'GET',
            signal: AbortSignal.any([
                AbortSignal.timeout(timeoutMs),
                ...(input.signal ? [input.signal] : []),
            ]),
        });
        if (!response.ok) {
            throw await remoteError(response);
        }
        return (await response.json()) as unknown;
    };
    const postJson = (path: string, body: object) =>
        call(path, { body: JSON.stringify(body), method: 'POST', type: 'application/json' });

    return {
        async changes(since: DriveAreaCounters, until?: DriveAreaCounters) {
            const query = new URLSearchParams({ since: JSON.stringify(since) });
            if (until) {
                query.set('until', JSON.stringify(until));
            }
            return driveChangesResponseSchema.parse(
                await call(`/api/agent/drive/changes?${query}`)
            );
        },
        async download(
            revision: { artifact_id: string; revision_id: string; sha256: string },
            target: string
        ) {
            const query = new URLSearchParams({ revision_id: revision.revision_id });
            const { download_url } = driveDownloadResponseSchema.parse(
                await call(
                    `/api/agent/artifacts/${encodeURIComponent(revision.artifact_id)}/download?${query}`
                )
            );
            const response = await fetch(download_url, {
                signal: AbortSignal.timeout(transferTimeoutMs),
            });
            if (!response.ok) {
                throw new DriveRemoteError(
                    'DOWNLOAD_FAILED',
                    response.status,
                    `Downloading ${revision.revision_id} failed.`
                );
            }
            await Bun.write(target, response);
            if ((await sha256File(target)) !== revision.sha256) {
                throw new DriveRemoteError(
                    'DOWNLOAD_MISMATCH',
                    200,
                    `Revision ${revision.revision_id} did not match its hash.`
                );
            }
        },
        async head(path: string) {
            const query = new URLSearchParams({ path });
            return await call(`/api/agent/artifacts/by-path?${query}`).then(
                (body) => driveHeadResponseSchema.parse(body).artifact,
                (error: unknown) => {
                    if (error instanceof DriveRemoteError && error.status === 404) {
                        return null;
                    }
                    throw error;
                }
            );
        },
        async put(
            request: {
                base_revision_id?: string;
                content_type: string;
                path: string;
                push_id: string;
                request_id: string;
            },
            file: string
        ) {
            const query = new URLSearchParams(
                Object.entries(request).filter(
                    (entry): entry is [string, string] => entry[1] !== undefined
                )
            );
            return drivePushOutcomeResponseSchema.parse(
                await call(
                    `/api/agent/drive/push/put?${query}`,
                    { body: Bun.file(file), method: 'POST', type: 'application/octet-stream' },
                    transferTimeoutMs
                )
            );
        },
        async delete(request: {
            base_revision_id: string;
            path: string;
            push_id: string;
            request_id: string;
        }) {
            return drivePushOutcomeResponseSchema.parse(
                await postJson('/api/agent/drive/push/delete', request)
            );
        },
        async close(pushId: string, unsent: readonly string[] = []) {
            return drivePushCloseResponseSchema.parse(
                await postJson('/api/agent/drive/push/close', {
                    push_id: pushId,
                    ...(unsent.length > 0 ? { unsent } : {}),
                })
            );
        },
    };
}
export type DriveRemote = ReturnType<typeof driveRemote>;

async function remoteError(response: Response) {
    const body = driveErrorResponseSchema.safeParse(await response.json().catch(() => null));
    const code = body.data?.code ?? `HTTP_${response.status}`;
    const message = body.data?.message ?? body.data?.error ?? `Drive answered ${response.status}.`;
    return new DriveRemoteError(code, response.status, message);
}

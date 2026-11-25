import { createHash } from 'node:crypto';
import {
    type DrivePushOutcome,
    type DriveRevision,
    artifactPathKey,
    driveChangesPageMax,
} from '@haus/api';
import { drivePushSessions, notDispatched } from './drive-push-sessions.fixture.ts';
import {
    areaOf,
    areas,
    changeOf,
    freeCopyPath,
    handles,
    listed,
    metadataOf,
    type Row,
} from './drive-wire.fixture.ts';
import { mergeLines } from './merge-lines.fixture.ts';

type Revision = DriveRevision;

export function startDriveServer(
    options: {
        pageSize?: number;
        route?: (request: Request, url: URL) => Promise<Response> | Response | null;
        writer?: (token: string) => string;
    } = {}
) {
    const writerOf = (request: Request) => {
        const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? '';
        return options.writer?.(token) ?? token;
    };
    const pageSize = options.pageSize ?? driveChangesPageMax;
    const blobs = new Map<string, Uint8Array>();
    const owners = new Map<string, string>();
    const live = new Map<string, Revision>();
    const rows = new Map<string, Row>();
    const counters: Record<string, number> = Object.fromEntries(areas.map((a) => [a.area, 0]));
    const replies = new Map<string, { change: string; outcome: DrivePushOutcome }>();
    const pushes = drivePushSessions();
    const failing = new Set<string>();
    const requests: string[] = [];
    const requestIds: string[] = [];
    let pushesFail = false;
    let lostAnswers = 0;
    let storageFull = false;
    let ids = 0;

    function write(path: string, text: string | Uint8Array, author: string) {
        const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
        ids += 1;
        const existing = live.get(artifactPathKey(path));
        const revision: Revision = {
            artifact_id: existing?.artifact_id ?? `art_${ids}`,
            author: { agent_id: author, type: 'agent' },
            content_type: 'text/plain',
            path: existing?.path ?? path,
            revision_id: `rev_${ids}`,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            size_bytes: bytes.length,
        };
        blobs.set(revision.revision_id, bytes);
        owners.set(revision.revision_id, revision.artifact_id);
        live.set(artifactPathKey(path), revision);
        touch(revision.path, revision.artifact_id, revision);
        return revision;
    }
    function remove(path: string) {
        const head = live.get(artifactPathKey(path));
        if (head) {
            live.delete(artifactPathKey(path));
            touch(head.path, head.artifact_id, null);
        }
    }
    function move(from: string, to: string) {
        const head = live.get(artifactPathKey(from));
        if (head) {
            remove(from);
            const moved = { ...head, path: to };
            live.set(artifactPathKey(to), moved);
            touch(to, head.artifact_id, moved);
        }
    }
    function touch(path: string, artifactId: string, revision: Revision | null) {
        const area = areaOf(path)?.area ?? 'haus';
        counters[area] = (counters[area] ?? 0) + 1;
        const row = { area, artifact_id: artifactId, path, revision, sequence: counters[area] };
        rows.set(artifactPathKey(path), row);
    }
    function decide(
        writer: string,
        path: string,
        base: string | undefined,
        bytes: Uint8Array | null
    ) {
        const area = areaOf(path);
        const head = live.get(artifactPathKey(path)) ?? null;
        if (!area || (area.area.startsWith('agent:') && area.area !== `agent:${writer}`)) {
            const code = area ? 'FORBIDDEN' : 'INVALID_PATH';
            return { code, current: head, message: code, outcome: 'refused', path } as const;
        }
        if (bytes === null) {
            return decideDelete(path, head, base);
        }
        const sha = createHash('sha256').update(bytes).digest('hex');
        if (head?.sha256 === sha) {
            return { current: head, outcome: 'unchanged', path } as const;
        }
        const moved = base && head === null ? movedOwnerOf(base) : null;
        if (moved) {
            const copy = write(copyFor(path, writer), bytes, writer);
            return {
                copy,
                current: moved,
                outcome: 'kept_both',
                path,
                reason: 'base_gone',
            } as const;
        }
        if (head === null || head.revision_id === base) {
            const current = write(path, bytes, writer);
            return base && head === null
                ? ({ current, outcome: 'kept_edit', path, reason: 'edit_over_delete' } as const)
                : ({ current, outcome: 'committed', path } as const);
        }
        const merged = base
            ? mergeLines(blobs.get(base), blobs.get(head.revision_id), bytes)
            : null;
        if (merged !== null) {
            return { current: write(path, merged, writer), outcome: 'merged', path } as const;
        }
        const copy = write(copyFor(path, writer), bytes, writer);
        const reason = base ? 'same_lines' : 'both_created';
        return { copy, current: head, outcome: 'kept_both', path, reason } as const;
    }
    function decideDelete(path: string, head: Revision | null, base: string | undefined) {
        if (head && head.revision_id !== base) {
            return {
                current: head,
                outcome: 'kept_edit',
                path,
                reason: 'edit_over_delete',
            } as const;
        }
        if (head) {
            remove(path);
        }
        return { current: null, outcome: 'deleted', path } as const;
    }
    function copyFor(path: string, writer: string) {
        return freeCopyPath(path, handles[writer] ?? writer, (candidate) =>
            live.has(artifactPathKey(candidate))
        );
    }
    function movedOwnerOf(base: string) {
        const owner = owners.get(base);
        return [...live.values()].find((revision) => revision.artifact_id === owner) ?? null;
    }
    function changes(url: URL) {
        const since = JSON.parse(url.searchParams.get('since') ?? '{}');
        const until = JSON.parse(url.searchParams.get('until') ?? 'null') ?? { ...counters };
        const all = [...rows.values()]
            .filter(
                (row) => row.sequence > (since[row.area] ?? 0) && row.sequence <= until[row.area]
            )
            .sort((a, b) => a.area.localeCompare(b.area) || a.sequence - b.sequence);
        return Response.json({
            areas: areas.map((area) => ({ ...area, counter: counters[area.area] })),
            changes: all.slice(0, pageSize).map(changeOf),
            complete: all.length <= pageSize,
            until,
        });
    }
    function blob(url: URL) {
        const revision = url.pathname.slice('/blob/'.length);
        const bytes = blobs.get(revision);
        return bytes && !failing.has(revision)
            ? new Response(bytes)
            : Response.json({ code: 'STORAGE_UNAVAILABLE' }, { status: 503 });
    }
    async function pushRequest(request: Request, url: URL) {
        if (pushesFail) {
            return Response.json({ code: 'STORAGE_UNAVAILABLE' }, { status: 503 });
        }
        const isPut = url.pathname.endsWith('/put');
        const body = (
            isPut ? Object.fromEntries(url.searchParams) : await request.clone().json()
        ) as Record<string, string>;
        const writer = writerOf(request);
        if (url.pathname.endsWith('/close')) {
            const push = pushes.open(body.push_id, writer);
            if (!push) {
                return notDispatched();
            }
            push.closed = true;
            return Response.json({ listed: push.listed });
        }
        const change = JSON.stringify([body.path, body.base_revision_id ?? null, isPut]);
        const stored = replies.get(body.request_id);
        if (stored) {
            return stored.change === change
                ? Response.json(stored.outcome)
                : Response.json(
                      { code: 'IDEMPOTENCY_KEY_REUSED', message: 'reused' },
                      { status: 409 }
                  );
        }
        const push = pushes.open(body.push_id, writer);
        if (!push) {
            return notDispatched();
        }
        if (push.closed) {
            return Response.json({ code: 'PUSH_CLOSED', message: 'closed' }, { status: 409 });
        }
        if (storageFull && isPut) {
            return Response.json({ code: 'STORAGE_LIMIT', message: 'full' }, { status: 507 });
        }
        const bytes = isPut ? new Uint8Array(await request.arrayBuffer()) : null;
        const outcome: DrivePushOutcome = decide(writer, body.path, body.base_revision_id, bytes);
        replies.set(body.request_id, { change, outcome });
        requestIds.push(body.request_id);
        if (lostAnswers > 0) {
            lostAnswers -= 1;
            return Response.json({ code: 'STORAGE_UNAVAILABLE' }, { status: 503 });
        }
        const conflict = listed(outcome);
        if (conflict) {
            push.listed.push(conflict);
        }
        return Response.json(outcome);
    }

    async function publishRaw(request: Request, url: URL) {
        const path = url.searchParams.get('path') ?? '';
        const writer = writerOf(request);
        const bytes = new Uint8Array(await request.arrayBuffer());
        const sha = createHash('sha256').update(bytes).digest('hex');
        const head = live.get(artifactPathKey(path));
        if (head && head.sha256 !== sha) {
            const current = metadataOf(head);
            return Response.json(
                { code: 'REVISION_CONFLICT', current, message: 'taken' },
                { status: 409 }
            );
        }
        return Response.json({ artifact: metadataOf(head ?? write(path, bytes, writer)) });
    }

    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: (request) => {
            const url = new URL(request.url);
            requests.push(`${request.method} ${url.pathname}`);
            const routed = options.route?.(request, url);
            if (routed) {
                return routed;
            }
            if (url.pathname === '/api/agent/drive/changes') {
                return changes(url);
            }
            if (url.pathname === '/api/agent/artifacts/publish-artifact-raw') {
                return publishRaw(request, url);
            }
            if (url.pathname === '/api/agent/artifacts/by-path') {
                const head = live.get(artifactPathKey(url.searchParams.get('path') ?? ''));
                return head
                    ? Response.json({ artifact: head })
                    : Response.json({ code: 'NOT_FOUND' }, { status: 404 });
            }
            if (/^\/api\/agent\/artifacts\/[^/]+\/download$/u.test(url.pathname)) {
                const revision = url.searchParams.get('revision_id') ?? '';
                return Response.json({ download_url: `${url.origin}/blob/${revision}` });
            }
            return url.pathname.startsWith('/blob/') ? blob(url) : pushRequest(request, url);
        },
    });

    return {
        origin: `http://127.0.0.1:${server.port}`,
        failDownload: (revisionId: string) => failing.add(revisionId),
        healDownloads: () => failing.clear(),
        requestIds,
        fillStorage: (full: boolean) => {
            storageFull = full;
        },
        loseNextAnswers: (count: number) => {
            lostAnswers = count;
        },
        failPushes: (fail: boolean) => {
            pushesFail = fail;
        },
        undispatched: pushes.undispatched,
        requests,
        text: (path: string) => {
            const head = live.get(artifactPathKey(path));
            return head ? new TextDecoder().decode(blobs.get(head.revision_id)) : null;
        },
        head: (path: string) => live.get(artifactPathKey(path)) ?? null,
        move,
        remove,
        stop: () => server.stop(true),
        write,
    };
}
export type DriveServer = ReturnType<typeof startDriveServer>;

import { createHash } from 'node:crypto';
import {
    type DriveConflictFile,
    type DrivePushOutcome,
    type DriveRevision,
    artifactPathKey,
    driveChangesPageMax,
} from '@haus/api';
import { mergeLines } from './merge-lines.fixture.ts';

type Revision = DriveRevision;
interface Row {
    area: string;
    artifact_id: string;
    path: string;
    revision: Revision | null;
    sequence: number;
}

const handles: Record<string, string> = { agt_alpha: 'alpha', agt_beta: 'beta' };
const areas = [
    { area: 'haus', root: 'haus' },
    { area: 'agent:agt_alpha', root: 'agents/alpha' },
    { area: 'agent:agt_beta', root: 'agents/beta' },
];

export function startDriveServer(options: { pageSize?: number } = {}) {
    const pageSize = options.pageSize ?? driveChangesPageMax;
    const blobs = new Map<string, Uint8Array>();
    const live = new Map<string, Revision>();
    const rows = new Map<string, Row>();
    const counters: Record<string, number> = Object.fromEntries(areas.map((a) => [a.area, 0]));
    const replies = new Map<string, { change: string; outcome: DrivePushOutcome }>();
    const pushes = new Map<string, { closed: boolean; listed: DriveConflictFile[] }>();
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
            if (head === null) {
                return { current: null, outcome: 'deleted', path } as const;
            }
            if (head.revision_id !== base) {
                return {
                    current: head,
                    outcome: 'kept_edit',
                    path,
                    reason: 'edit_over_delete',
                } as const;
            }
            remove(path);
            return { current: null, outcome: 'deleted', path } as const;
        }
        const sha = createHash('sha256').update(bytes).digest('hex');
        if (head?.sha256 === sha) {
            return { current: head, outcome: 'unchanged', path } as const;
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
        const copy = write(freeCopyPath(path, handles[writer] ?? writer), bytes, writer);
        const reason = base ? 'same_lines' : 'both_created';
        return { copy, current: head, outcome: 'kept_both', path, reason } as const;
    }

    function freeCopyPath(path: string, handle: string) {
        for (let attempt = 1; ; attempt += 1) {
            const candidate = copyPath(path, attempt === 1 ? handle : `${handle}-${attempt}`);
            if (!live.has(artifactPathKey(candidate))) {
                return candidate;
            }
        }
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
        const push = pushes.get(body.push_id) ?? { closed: false, listed: [] };
        pushes.set(body.push_id, push);
        if (url.pathname.endsWith('/close')) {
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
        if (storageFull && isPut) {
            return Response.json({ code: 'STORAGE_LIMIT', message: 'full' }, { status: 507 });
        }
        if (push.closed) {
            return Response.json({ code: 'PUSH_CLOSED', message: 'closed' }, { status: 409 });
        }
        const writer = request.headers.get('authorization')?.replace('Bearer ', '') ?? '';
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

    const server = Bun.serve({
        port: 0,
        fetch: (request) => {
            const url = new URL(request.url);
            requests.push(`${request.method} ${url.pathname}`);
            if (url.pathname === '/api/agent/drive/changes') {
                return changes(url);
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
        requests,
        text: (path: string) => {
            const head = live.get(artifactPathKey(path));
            return head ? new TextDecoder().decode(blobs.get(head.revision_id)) : null;
        },
        head: (path: string) => live.get(artifactPathKey(path)) ?? null,
        remove,
        stop: () => server.stop(true),
        write,
    };
}
export type DriveServer = ReturnType<typeof startDriveServer>;

function areaOf(path: string) {
    return areas.find((area) => path.startsWith(`${area.root}/`)) ?? null;
}

function changeOf(row: Row) {
    const { revision } = row;
    return {
        area: row.area,
        artifact_id: row.artifact_id,
        change: revision ? 'put' : 'delete',
        content_type: revision?.content_type ?? null,
        path: row.path,
        revision_id: revision?.revision_id ?? null,
        sequence: row.sequence,
        sha256: revision?.sha256 ?? null,
        size_bytes: revision?.size_bytes ?? null,
    };
}

function copyPath(path: string, handle: string) {
    const slash = path.lastIndexOf('/');
    const dot = path.lastIndexOf('.');
    return dot > slash + 1
        ? `${path.slice(0, dot)}.conflict-${handle}${path.slice(dot)}`
        : `${path}.conflict-${handle}`;
}

function listed(outcome: DrivePushOutcome) {
    if (outcome.outcome === 'kept_both' || outcome.outcome === 'kept_edit') {
        return {
            copyPath: outcome.outcome === 'kept_both' ? outcome.copy.path : null,
            currentAuthorHandle: handleOf(outcome.current),
            currentRevisionId: outcome.current?.revision_id ?? null,
            outcome: outcome.outcome,
            path: outcome.path,
            reason: outcome.reason,
        } satisfies DriveConflictFile;
    }
    if (outcome.outcome === 'refused') {
        return {
            copyPath: null,
            currentAuthorHandle: handleOf(outcome.current),
            currentRevisionId: outcome.current?.revision_id ?? null,
            outcome: outcome.outcome,
            path: outcome.path,
            reason: outcome.code,
        } satisfies DriveConflictFile;
    }
    return null;
}

function handleOf(revision: Revision | null) {
    return revision?.author.type === 'agent' ? (handles[revision.author.agent_id] ?? null) : null;
}

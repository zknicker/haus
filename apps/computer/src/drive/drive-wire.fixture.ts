import type { DriveConflictFile, DrivePushOutcome, DriveRevision } from '@haus/api';

type Revision = DriveRevision;
export interface Row {
    area: string;
    artifact_id: string;
    path: string;
    revision: Revision | null;
    sequence: number;
}

export const handles: Record<string, string> = { agt_alpha: 'alpha', agt_beta: 'beta' };
export const areas = [
    { area: 'haus', root: 'haus' },
    { area: 'agent:agt_alpha', root: 'agents/alpha' },
    { area: 'agent:agt_beta', root: 'agents/beta' },
];

export function metadataOf(revision: Revision) {
    const filename = revision.path.slice(revision.path.lastIndexOf('/') + 1);
    return {
        artifact_id: revision.artifact_id,
        content_type: revision.content_type,
        created_at: '2026-11-19T00:00:00.000Z',
        creator: revision.author,
        filename,
        path: revision.path,
        revision_id: revision.revision_id,
        revision_number: 1,
        sha256: revision.sha256,
        size_bytes: revision.size_bytes,
        stable_url: `https://haus.test/artifacts/${revision.artifact_id}`,
        title: filename,
        updated_at: '2026-11-19T00:00:00.000Z',
        version_url: `https://haus.test/artifacts/${revision.artifact_id}?revision=${revision.revision_id}`,
    };
}

export function areaOf(path: string) {
    return areas.find((area) => path.startsWith(`${area.root}/`)) ?? null;
}

export function changeOf(row: Row) {
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

export function changesPage(
    url: URL,
    rows: ReadonlyMap<string, Row>,
    counters: Record<string, number>,
    pageSize: number
) {
    const since = JSON.parse(url.searchParams.get('since') ?? '{}');
    const until = JSON.parse(url.searchParams.get('until') ?? 'null') ?? { ...counters };
    const all = [...rows.values()]
        .filter((row) => row.sequence > (since[row.area] ?? 0) && row.sequence <= until[row.area])
        .sort((a, b) => a.area.localeCompare(b.area) || a.sequence - b.sequence);
    return Response.json({
        areas: areas.map((area) => ({ ...area, counter: counters[area.area] })),
        changes: all.slice(0, pageSize).map(changeOf),
        complete: all.length <= pageSize,
        until,
    });
}

export function freeCopyPath(path: string, handle: string, taken: (path: string) => boolean) {
    for (let attempt = 1; ; attempt += 1) {
        const candidate = copyPath(path, attempt === 1 ? handle : `${handle}-${attempt}`);
        if (!taken(candidate)) {
            return candidate;
        }
    }
}

function copyPath(path: string, handle: string) {
    const slash = path.lastIndexOf('/');
    const dot = path.lastIndexOf('.');
    return dot > slash + 1
        ? `${path.slice(0, dot)}.conflict-${handle}${path.slice(dot)}`
        : `${path}.conflict-${handle}`;
}

export function listed(outcome: DrivePushOutcome) {
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

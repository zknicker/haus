import { type LinearIssueResult, type LinearIssueView, parseLinearIssueUrl } from '@haus/api';
import { and, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { linearWorkspacesTable } from '../postgres/schema/linear.ts';
import { linearAgentLabelsTable, linearWritesTable } from '../postgres/schema/linear-activity.ts';
import {
    type LinearIssueRecord,
    readLinearIssue,
    readLinearOrganizationUrlKey,
} from './issue-reference-read.ts';
import { linearThumbnailPath } from './thumbnail-route.ts';
import { signLinearThumbnailToken } from './thumbnail-token.ts';

// `linear.issue` (specs/linear-app.md#issue-references-in-chat): the URL's url
// key selects the live workspace on the member's Server, the workspace token
// reads the issue, and Haus adds the Agent named by its label and the latest
// ledger-attributed change. Issue records are cached per workspace and issue
// id for five minutes; deliveries evict them.

const cacheTtlMs = 5 * 60_000;
const urlKeyRefreshMs = 5 * 60_000;

export interface LinearIssueReferenceDeps {
    /** The workspace actor's access token for a connection, or null when it cannot sign in. */
    accessToken: (connectionId: string) => Promise<string | null>;
    /** The App origin a thumbnail URL is built on. */
    appOrigin: string;
    now?: () => number;
    /** `HAUS_LINEAR_URL_SIGNING_KEY`; without it chips carry no thumbnail. */
    signingKey: string | null;
    transport: typeof fetch;
}

interface CachedIssue {
    expiresAt: number;
    record: LinearIssueRecord;
}

const issues = new Map<string, CachedIssue>();
const identifierIndex = new Map<string, string>();
const urlKeyRefreshedAt = new Map<string, number>();

/** Drops one issue so the next chip read goes to Linear; deliveries call it. */
export function evictLinearIssue(workspaceId: string, issueId: string) {
    issues.delete(`${workspaceId}:${issueId}`);
}

/** Answers one chip; the caller has already checked Server membership. */
export async function readLinearIssueReference(
    db: HausDatabase,
    deps: LinearIssueReferenceDeps,
    input: { serverId: string; url: string }
): Promise<LinearIssueResult> {
    const parsed = parseLinearIssueUrl(input.url);
    if (!parsed) {
        return { reason: 'issue_not_found', status: 'unavailable' };
    }
    const now = deps.now?.() ?? Date.now();
    let workspace = await findWorkspace(db, input.serverId, parsed.urlKey);
    if (!workspace && (await refreshUrlKeys(db, deps, input.serverId, now))) {
        workspace = await findWorkspace(db, input.serverId, parsed.urlKey);
    }
    if (!workspace) {
        return { reason: 'workspace_not_connected', status: 'unavailable' };
    }
    const { connectionId } = workspace;
    const token =
        workspace.status === 'active' && connectionId ? await deps.accessToken(connectionId) : null;
    if (!(token && connectionId)) {
        return { reason: 'workspace_unavailable', status: 'unavailable' };
    }
    const record = await cachedIssue(deps, workspace.id, token, parsed.identifier, now);
    if (!record) {
        return { reason: 'issue_not_found', status: 'unavailable' };
    }
    return {
        issue: await toView(db, deps, {
            connectionId,
            now,
            record,
            workspaceId: workspace.id,
        }),
        status: 'available',
    };
}

async function cachedIssue(
    deps: LinearIssueReferenceDeps,
    workspaceId: string,
    token: string,
    identifier: string,
    now: number
) {
    const issueId = identifierIndex.get(`${workspaceId}:${identifier}`);
    const cached = issueId ? issues.get(`${workspaceId}:${issueId}`) : undefined;
    if (cached && cached.expiresAt > now) {
        return cached.record;
    }
    const record = await readLinearIssue(deps.transport, token, identifier);
    if (record) {
        issues.set(`${workspaceId}:${record.id}`, { expiresAt: now + cacheTtlMs, record });
        identifierIndex.set(`${workspaceId}:${identifier}`, record.id);
    }
    return record;
}

async function toView(
    db: HausDatabase,
    deps: LinearIssueReferenceDeps,
    input: { connectionId: string; now: number; record: LinearIssueRecord; workspaceId: string }
): Promise<LinearIssueView> {
    const { record } = input;
    const [delegateAgentId, lastAgentChange] = await Promise.all([
        labelAgent(
            db,
            input.workspaceId,
            record.labels.map((label) => label.id)
        ),
        lastLedgerChange(db, input.workspaceId, record.id),
    ]);
    const thumbnailUrl =
        record.thumbnailAssetUrl && deps.signingKey
            ? new URL(
                  linearThumbnailPath(
                      signLinearThumbnailToken(
                          deps.signingKey,
                          { assetUrl: record.thumbnailAssetUrl, connectionId: input.connectionId },
                          input.now
                      )
                  ),
                  deps.appOrigin
              ).toString()
            : null;
    return {
        assignee: record.assignee,
        delegateAgentId,
        id: record.id,
        identifier: record.identifier,
        labels: record.labels,
        lastAgentChange,
        state: record.state,
        thumbnailUrl,
        title: record.title,
        url: record.url,
    };
}

async function findWorkspace(db: HausDatabase, serverId: string, urlKey: string) {
    const [row] = await db
        .select({
            connectionId: linearWorkspacesTable.connectionId,
            id: linearWorkspacesTable.id,
            status: linearWorkspacesTable.status,
        })
        .from(linearWorkspacesTable)
        .where(
            and(
                eq(linearWorkspacesTable.serverId, serverId),
                eq(linearWorkspacesTable.urlKey, urlKey),
                ne(linearWorkspacesTable.status, 'removed')
            )
        )
        .limit(1);
    return row ?? null;
}

/** Once per Server per five minutes: a renamed workspace keeps its chips. */
async function refreshUrlKeys(
    db: HausDatabase,
    deps: LinearIssueReferenceDeps,
    serverId: string,
    now: number
): Promise<boolean> {
    const last = urlKeyRefreshedAt.get(serverId);
    if (last !== undefined && now - last < urlKeyRefreshMs) {
        return false;
    }
    urlKeyRefreshedAt.set(serverId, now);
    const live = await db
        .select({
            connectionId: linearWorkspacesTable.connectionId,
            id: linearWorkspacesTable.id,
            urlKey: linearWorkspacesTable.urlKey,
        })
        .from(linearWorkspacesTable)
        .where(
            and(
                eq(linearWorkspacesTable.serverId, serverId),
                eq(linearWorkspacesTable.status, 'active')
            )
        );
    let changed = false;
    for (const workspace of live) {
        const token = workspace.connectionId
            ? await deps.accessToken(workspace.connectionId)
            : null;
        const urlKey = token
            ? await readLinearOrganizationUrlKey(deps.transport, token).catch(() => null)
            : null;
        if (urlKey && urlKey !== workspace.urlKey) {
            await db
                .update(linearWorkspacesTable)
                .set({ updatedAt: new Date(now), urlKey })
                .where(eq(linearWorkspacesTable.id, workspace.id));
            changed = true;
        }
    }
    return changed;
}

async function labelAgent(db: HausDatabase, workspaceId: string, labelIds: string[]) {
    if (labelIds.length === 0) {
        return null;
    }
    const [row] = await db
        .select({ agentId: linearAgentLabelsTable.agentId })
        .from(linearAgentLabelsTable)
        .where(
            and(
                eq(linearAgentLabelsTable.workspaceId, workspaceId),
                eq(linearAgentLabelsTable.state, 'active'),
                inArray(linearAgentLabelsTable.labelId, labelIds)
            )
        )
        .limit(1);
    return row?.agentId ?? null;
}

async function lastLedgerChange(db: HausDatabase, workspaceId: string, issueId: string) {
    const [row] = await db
        .select({
            agentId: linearWritesTable.agentId,
            completedAt: linearWritesTable.completedAt,
            tool: linearWritesTable.tool,
        })
        .from(linearWritesTable)
        .where(
            and(
                eq(linearWritesTable.workspaceId, workspaceId),
                eq(linearWritesTable.status, 'succeeded'),
                or(
                    eq(linearWritesTable.resultEntityId, issueId),
                    and(
                        eq(linearWritesTable.targetId, issueId),
                        isNull(linearWritesTable.resultEntityId)
                    )
                )
            )
        )
        .orderBy(desc(linearWritesTable.completedAt))
        .limit(1);
    if (!row?.completedAt) {
        return null;
    }
    return {
        agentId: row.agentId,
        changedAt: row.completedAt.toISOString(),
        summary: ledgerToolSummary(row.tool),
    };
}

const pastTense: Record<string, string> = {
    add: 'Added',
    apply: 'Applied',
    archive: 'Archived',
    assign: 'Assigned',
    comment: 'Commented on',
    create: 'Created',
    delegate: 'Delegated',
    delete: 'Deleted',
    move: 'Moved',
    remove: 'Removed',
    reply: 'Replied on',
    save: 'Saved',
    set: 'Set',
    update: 'Updated',
    upload: 'Uploaded',
};

/**
 * `update_issue` reads "Updated issue". The tool name is the only description
 * the ledger keeps; an unknown verb falls back to a plain "Changed the issue".
 */
export function ledgerToolSummary(tool: string) {
    const [verb = '', ...rest] = tool.split(/[_-]+/u).filter(Boolean);
    const past = pastTense[verb.toLowerCase()];
    return past && rest.length > 0 ? `${past} ${rest.join(' ')}` : 'Changed the issue';
}

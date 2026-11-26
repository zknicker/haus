import { afterAll, beforeAll, expect } from 'bun:test';
import {
    artifactPublishResultSchema,
    type DrivePushOutcome,
    drivePushCloseResultSchema,
    drivePushOutcomeSchema,
} from '@haus/api';
import { sql } from 'drizzle-orm';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { recordRunTrigger } from '../src/server-agents/record-agent-turn.ts';
import { randomShortId } from '../src/tasks/task-short-id.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { MemoryArtifactStorage } from './artifact-drive-fixture.ts';

type Body = string | Uint8Array;

export function drivePushFixture(
    options: { artifactStorageBytes?: number; seedManagedSkills?: boolean } = {}
) {
    const storage = new MemoryArtifactStorage();
    const fixture = agentCreationFixture(undefined, {
        artifactStorage: storage,
        artifactStorageBytes: options.artifactStorageBytes,
        seedManagedSkills: options.seedManagedSkills,
    });
    let connection: HausConnection;
    let ownerToken: string;

    beforeAll(async () => {
        connection = await connectHausDatabase(fixture.harness.databaseUrl);
        ownerToken = await fixture.harness.humans.mintSessionToken('user_agent_creation_owner');
    });

    afterAll(async () => {
        await connection?.close();
    });

    async function dispatch(runId: string, options: { agentId?: string; taskId?: string } = {}) {
        const agentId = options.agentId ?? fixture.orbitAgentId;
        const chatId = options.taskId ? await taskChat(options.taskId) : fixture.channelId;
        await recordRunTrigger(
            connection.db,
            { agentId, runId, serverId: fixture.serverId },
            { chatId, dedupeKey: `wake_${runId}`, source: 'chat' }
        );
        return await fixture.mintRunner(runId, agentId, fixture.channelId, false);
    }

    async function taskChat(taskId: string) {
        const chatId = createOpaqueId('cht');
        await connection.db.execute(sql`
            insert into chats (id, server_id, kind, parent_chat_id, parent_chat_kind)
            values (${chatId}, ${fixture.serverId}, 'task', ${fixture.channelId}, 'channel')
        `);
        await connection.db.execute(sql`
            insert into tasks (id, server_id, short_id, title, chat_id, created_by_agent_id,
                project_id)
            values (${taskId}, ${fixture.serverId}, ${randomShortId()}, ${taskId}, ${chatId},
                ${fixture.orbitAgentId}, ${fixture.channelId})
        `);
        return chatId;
    }

    async function put(
        runner: { token: string },
        query: Record<string, string>,
        body: Body,
        headers: Record<string, string> = {}
    ) {
        const url = new URL('/api/agent/drive/push/put', fixture.harness.url);
        url.search = new URLSearchParams({ content_type: 'text/plain', ...query }).toString();
        const response = await fetch(url, {
            body: bytes(body),
            headers: {
                authorization: `Bearer ${runner.token}`,
                'content-type': 'application/octet-stream',
                ...headers,
            },
            method: 'POST',
        });
        return {
            body: (await response.json()) as Record<string, unknown>,
            status: response.status,
        };
    }

    async function putOutcome(
        runner: { token: string },
        query: Record<string, string>,
        body: Body
    ) {
        const response = await put(runner, query, body);
        expect(response.status).toBe(200);
        return drivePushOutcomeSchema.parse(response.body);
    }

    async function postJson(runner: { token: string }, route: string, body: object) {
        const response = await fetch(new URL(route, fixture.harness.url), {
            body: JSON.stringify(body),
            headers: {
                authorization: `Bearer ${runner.token}`,
                'content-type': 'application/json',
            },
            method: 'POST',
        });
        return {
            body: (await response.json()) as Record<string, unknown>,
            status: response.status,
        };
    }

    async function deleteOutcome(runner: { token: string }, body: Record<string, string>) {
        const response = await postJson(runner, '/api/agent/drive/push/delete', body);
        expect(response.status).toBe(200);
        return drivePushOutcomeSchema.parse(response.body);
    }

    async function close(runner: { token: string }, pushId: string) {
        const response = await postJson(runner, '/api/agent/drive/push/close', { push_id: pushId });
        expect(response.status).toBe(200);
        return drivePushCloseResultSchema.parse(response.body).listed;
    }

    async function publishResponse(
        runner: { token: string },
        query: Record<string, string>,
        body: Body
    ) {
        const url = new URL('/api/agent/artifacts/publish-artifact-raw', fixture.harness.url);
        url.search = new URLSearchParams({ content_type: 'text/plain', ...query }).toString();
        const response = await fetch(url, {
            body: bytes(body),
            headers: {
                authorization: `Bearer ${runner.token}`,
                'content-type': 'application/octet-stream',
            },
            method: 'POST',
        });
        return {
            body: (await response.json()) as Record<string, unknown>,
            status: response.status,
        };
    }

    async function publish(runner: { token: string }, query: Record<string, string>, body: Body) {
        const response = await publishResponse(runner, query, body);
        expect(response.status).toBe(200);
        return artifactPublishResultSchema.parse(response.body).artifact;
    }

    async function memberPut(query: Record<string, string>, body: Body) {
        const url = new URL(`/artifacts/${fixture.serverId}/publish`, fixture.harness.url);
        url.search = new URLSearchParams(query).toString();
        const response = await fetch(url, {
            body: bytes(body),
            headers: {
                authorization: `Bearer ${ownerToken}`,
                'content-type': 'application/octet-stream',
            },
            method: 'PUT',
        });
        return {
            body: (await response.json()) as Record<string, unknown>,
            status: response.status,
        };
    }

    async function revision(revisionId: string) {
        const [row] = (await fixture.harness.sql`
            select r.artifact_id, r.author_agent_id, r.base_revision_id, r.object_key,
                   r.parent_revision_id, r.revision_number, r.state, r.task_id, a.path
            from artifact_revisions r join artifacts a on a.id = r.artifact_id
            where r.id = ${revisionId}
        `) as ({ object_key: string } & Record<string, unknown>)[];
        if (!row) {
            throw new Error(`No revision ${revisionId}.`);
        }
        const { object_key: objectKey, ...rest } = row;
        return { ...rest, text: new TextDecoder().decode(storage.objects.get(objectKey)) };
    }

    async function conflictItems(agentId: string) {
        return (await fixture.harness.sql`
            select dedupe_key, content from agent_inbox
            where agent_id = ${agentId} and source = 'drive_conflict'
            order by dedupe_key
        `) as { content: string; dedupe_key: string }[];
    }

    async function countRows(table: 'artifact_revisions' | 'artifacts', pathPrefix: string) {
        const [row] =
            table === 'artifacts'
                ? await fixture.harness.sql`
                      select count(*)::int as count from artifacts
                      where server_id = ${fixture.serverId} and path like ${`${pathPrefix}%`}
                  `
                : await fixture.harness.sql`
                      select count(*)::int as count from artifact_revisions r
                      join artifacts a on a.id = r.artifact_id
                      where r.server_id = ${fixture.serverId} and a.path like ${`${pathPrefix}%`}
                        and r.state = 'ready'
                  `;
        return (row as { count: number }).count;
    }

    const writer = (agentId: string) =>
        fixture.mintRunner(`run_direct_${agentId}`, agentId, fixture.channelId, false);

    return {
        close,
        conflictItems,
        countRows,
        deleteOutcome,
        dispatch,
        fixture,
        memberPut,
        orbitWriter: () => writer(fixture.orbitAgentId),
        peerWriter: () => writer(fixture.peerAgentId),
        postJson,
        publish,
        publishResponse,
        put,
        putOutcome,
        revision,
        storage,
    };
}

export function expectOutcome<Kind extends DrivePushOutcome['outcome']>(
    outcome: DrivePushOutcome,
    kind: Kind
) {
    if (outcome.outcome !== kind) {
        throw new Error(`Expected ${kind}, got ${JSON.stringify(outcome)}.`);
    }
    return outcome as Extract<DrivePushOutcome, { outcome: Kind }>;
}

function bytes(body: Body) {
    return typeof body === 'string' ? new TextEncoder().encode(body) : body;
}

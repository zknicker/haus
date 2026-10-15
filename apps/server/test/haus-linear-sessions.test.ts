import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { LinearDeliveryRow } from '../src/linear/delivery-handler.ts';
import { linearSessionHandler, noAgentElicitation } from '../src/linear/session-routing.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    chatMessagesTable,
    chatsTable,
    linearWorkspacesTable,
    serverMembershipsTable,
} from '../src/postgres/schema.ts';
import {
    agentHandle,
    linearSessionEventAt,
    sessionEvent,
    sessionFor,
} from './linear-session-events.ts';
import {
    deliveryRow,
    inboxRows,
    outboxRows,
    seedLinearSessionWorld,
} from './linear-session-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Session routing (specs/linear-app.md#linear-sessions): who gets the session,
// the binder-DM anchor, the acknowledgment, the inbox row, and rebinding.

let cluster: PostgresCluster;
let connection: HausConnection;
const appOrigin = 'https://app.haus.test';
const handler = linearSessionHandler({ appOrigin });
const now = linearSessionEventAt;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

async function route(row: LinearDeliveryRow) {
    return await connection.db.transaction((tx) => handler.apply(tx, row, now, undefined));
}

test('a mention naming an Agent anchors on its DM with the binder, acks, and queues the envelope', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const [beacon] = await connection.db
        .select({ handle: chatsTable.id })
        .from(chatsTable)
        .where(eq(chatsTable.serverId, world.serverId));
    expect(beacon).toBeUndefined();
    const handle = await agentHandle(connection.db, world.agents.beacon);
    const row = deliveryRow(world, {
        at: now,
        body: sessionEvent(world, { prompt: `@haus ${handle} can you review this?` }),
        event: 'AgentSessionEvent',
    });
    const outcome = await route(row);
    expect(outcome).toMatchObject({ kind: 'done', routed: 1 });
    expect(outcome.kind === 'done' && outcome.announce.length).toBe(1);
    const session = await sessionFor(connection.db, world);
    expect(session).toMatchObject({ agentId: world.agents.beacon, status: 'active' });
    const [dm] = await connection.db
        .select()
        .from(chatsTable)
        .where(eq(chatsTable.id, session?.anchorChatId ?? ''));
    expect(dm).toMatchObject({
        dmAgentId: world.agents.beacon,
        dmMemberOneUserId: world.binderUserId,
        kind: 'dm',
    });
    const messages = await connection.db
        .select()
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.chatId, dm?.id ?? ''));
    expect(messages).toEqual([]);
    const [ack] = await outboxRows(connection.db, world.workspaceId);
    expect(ack).toMatchObject({ credentialId: world.credentialId, kind: 'session_ack' });
    expect(ack?.input).toMatchObject({
        body: 'Beacon is on it',
        externalUrls: [{ label: 'Open in Haus' }],
        sessionRowId: session?.id,
    });
    const [item] = await inboxRows(connection.db, world.serverId);
    expect(item).toMatchObject({
        agentId: world.agents.beacon,
        chatId: dm?.id,
        dedupeKey: `linear:${session?.id}:${row.deliveryId}`,
        source: 'linear_session',
    });
    expect(item?.content).toContain('◆ Linear session: DES-142 · mentioned · Beacon');
    expect(item?.content).toContain('Keep designs on brand.');
    // A replayed delivery queues nothing new.
    await route({ ...row });
    expect(await inboxRows(connection.db, world.serverId)).toHaveLength(1);
});

test('without a name the issue’s Agent label routes, then the default Agent, then an elicitation', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    await route(
        deliveryRow(world, {
            body: sessionEvent(world, { labelIds: [world.labels.juniper, 'label-other'] }),
            event: 'AgentSessionEvent',
        })
    );
    expect((await sessionFor(connection.db, world))?.agentId).toBe(world.agents.juniper);

    const fallback = await seedLinearSessionWorld(connection.db);
    await connection.db
        .update(linearWorkspacesTable)
        .set({ defaultAgentId: fallback.agents.beacon })
        .where(eq(linearWorkspacesTable.id, fallback.workspaceId));
    await route(
        deliveryRow(fallback, { body: sessionEvent(fallback), event: 'AgentSessionEvent' })
    );
    expect((await sessionFor(connection.db, fallback))?.agentId).toBe(fallback.agents.beacon);

    const nobody = await seedLinearSessionWorld(connection.db);
    expect(
        await route(deliveryRow(nobody, { body: sessionEvent(nobody), event: 'AgentSessionEvent' }))
    ).toMatchObject({ kind: 'done', routed: 0 });
    const [elicitation] = await outboxRows(connection.db, nobody.workspaceId);
    expect(elicitation).toMatchObject({
        input: { body: noAgentElicitation, type: 'elicitation' },
        kind: 'session_activity',
    });
    expect(await inboxRows(connection.db, nobody.serverId)).toEqual([]);
});

test('a binder who left falls back to the longest-standing Owner', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    await connection.db
        .update(serverMembershipsTable)
        .set({ revokedAt: now })
        .where(eq(serverMembershipsTable.userId, world.binderUserId));
    await route(
        deliveryRow(world, {
            body: sessionEvent(world, { labelIds: [world.labels.juniper] }),
            event: 'AgentSessionEvent',
        })
    );
    const session = await sessionFor(connection.db, world);
    const [dm] = await connection.db
        .select()
        .from(chatsTable)
        .where(eq(chatsTable.id, session?.anchorChatId ?? ''));
    expect(dm?.dmMemberOneUserId).toBe(world.ownerUserId);
});

test('a follow-up routed to another Agent rebinds the session and retires the old Agent’s rows', async () => {
    const world = await seedLinearSessionWorld(connection.db);
    const linearSessionId = crypto.randomUUID();
    await route(
        deliveryRow(world, {
            body: sessionEvent(world, { labelIds: [world.labels.juniper], linearSessionId }),
            event: 'AgentSessionEvent',
        })
    );
    const beaconHandle = await agentHandle(connection.db, world.agents.beacon);
    await route(
        deliveryRow(world, {
            body: sessionEvent(world, {
                action: 'prompted',
                linearSessionId,
                prompt: `${beaconHandle}, take over please`,
            }),
            event: 'AgentSessionEvent',
        })
    );
    expect((await sessionFor(connection.db, world))?.agentId).toBe(world.agents.beacon);
    const rows = await inboxRows(connection.db, world.serverId);
    expect(rows.map((row) => row.agentId)).toEqual([world.agents.beacon]);
    expect(rows[0]?.content).toContain('· prompted · Beacon');
    // Only the session's creation is acknowledged.
    expect((await outboxRows(connection.db, world.workspaceId)).map((row) => row.kind)).toEqual([
        'session_ack',
    ]);
});

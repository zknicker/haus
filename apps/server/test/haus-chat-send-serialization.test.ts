import { expect, test } from 'bun:test';
import { createHausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * Every durable write serializes on the Server row, so concurrent sends queue
 * behind one another while ordinary Server-scoped reads keep arriving. A read
 * that lands on a connection still inside a send's transaction strands that
 * send's `for update`, and every later write waits on a lock nobody will
 * release: the sends never settle and their messages never commit.
 */
test('concurrent Agent DM sends commit while Server-scoped reads keep arriving', async () => {
    const harness = await startHausServerHarness();
    const owner = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_send_serialize_owner')
    );
    try {
        const server = await owner.trpc.server.create.mutate({
            displayName: 'Send Serialize',
            slug: 'send-serialize',
        });
        const serverId = server.id;
        const [{ id: ownerUserId }] = await harness.sql`
            select id from users where auth_subject = 'user_send_serialize_owner'
        `;
        const computerId = 'cmp_sendserializecmp';
        await harness.sql`
            insert into computers (
                id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
            )
            values (
                ${computerId}, ${serverId}, ${ownerUserId}, ${'e'.repeat(64)},
                ${{ runtimes: [{ id: 'pi', label: 'Pi', models: [{ id: 'pi', label: 'Pi' }] }] }}::jsonb,
                'healthy'
            )
        `;
        const created = await owner.trpc.agent.create.mutate({
            computerId,
            displayName: 'Blippy',
            handle: 'blippy',
            modelId: 'pi',
            runtimeId: 'pi',
            serverId,
        });
        const agentId = created.agent.id;
        const sends = 12;

        const settled = await Promise.race([
            Promise.all(
                Array.from({ length: sends }, (_, index) => [
                    owner.trpc.chat.send.mutate({
                        agentId,
                        content: `serialized send ${index}`,
                        nonce: `send-serialize-${index}`,
                        serverId,
                        targetKind: 'agent-dm' as const,
                    }),
                    owner.trpc.server.list.query(),
                    owner.trpc.chat.list.query({ serverId }),
                ]).flat()
            ).then(() => 'settled' as const),
            Bun.sleep(20_000).then(() => 'wedged' as const),
        ]);
        expect(settled).toBe('settled');

        const [{ total }] = await harness.sql`
            select count(*)::int as total from chat_messages where server_id = ${serverId}
        `;
        expect(total).toBe(sends);
        expect(await orphanedServerRowHolders(harness)).toEqual([]);
    } finally {
        owner.close();
        await harness.close();
    }
}, 120_000);

/** A transaction still holding the Server row once every request settled. */
async function orphanedServerRowHolders(harness: HausServerHarness) {
    for (let attempt = 0; attempt < 20; attempt++) {
        const holders = await harness.sql`
            select activity.pid
            from pg_stat_activity activity
            where activity.datname = current_database()
              and activity.state = 'idle in transaction'
              and exists (
                  select 1
                  from pg_locks lock_row
                  join pg_class relation on relation.oid = lock_row.relation
                  where lock_row.pid = activity.pid
                    and relation.relname = 'servers'
                    and lock_row.mode = 'RowShareLock'
              )
        `;
        if (holders.length === 0) {
            return holders;
        }
        await Bun.sleep(250);
    }
    return await harness.sql`
        select pid, left(query, 120) as query from pg_stat_activity
        where datname = current_database() and state = 'idle in transaction'
    `;
}

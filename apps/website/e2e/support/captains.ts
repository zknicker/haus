import { randomBytes } from 'node:crypto';
import { createHomedAgent } from './project.ts';
import { type createClient, runPsql } from './server.ts';

const codexInventory = {
    runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }],
};

export async function createTestCaptain(
    client: ReturnType<typeof createClient>,
    input: {
        computerId?: string;
        databaseUrl: string;
        displayName: string;
        handle: string;
        serverId: string;
    }
) {
    const computerId = input.computerId ?? `cmp_${randomBytes(12).toString('base64url')}`;
    const inventory = JSON.stringify(codexInventory);
    runPsql(
        input.databaseUrl,
        input.computerId
            ? `update computers set reported_inventory = '${inventory}'::jsonb
               where id = '${computerId}'`
            : `insert into computers (
                 id, server_id, attached_by_user_id, credential_hash, health, reported_inventory
               )
               select '${computerId}', server_id, user_id,
                 md5(random()::text) || md5(random()::text), 'offline', '${inventory}'::jsonb
               from server_memberships
               where server_id = '${input.serverId}' and role = 'owner'`
    );
    const { agent } = await createHomedAgent(client, {
        computerId,
        displayName: input.displayName,
        handle: input.handle,
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: input.serverId,
    });
    return agent.id;
}

import { randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { SQL } from 'bun';
import { createDevStackStatePaths } from '../dev-stack-shared.mjs';

export const macbookName = 'MacBook';
const idAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function openComputerLedger() {
    const sql = openStackDatabase();

    async function readHome(agentId) {
        const [home] = await sql`
            select c.id, c.server_id, c.attached_by_user_id, c.reported_inventory ->> 'name' as name
            from agents a
            join computers c on c.server_id = a.server_id and c.id = a.computer_id
            where a.id = ${agentId}
        `;
        if (!home) {
            return null;
        }
        return {
            attachedBy: home.attached_by_user_id,
            id: home.id,
            name: home.name,
            serverId: home.server_id,
        };
    }

    async function readInvocations(agentId) {
        const rows = await sql`
            select operation_kind, computer_id, state, outcome, refusal, run_id
            from agent_invocations
            where agent_id = ${agentId}
            order by requested_at, seq
        `;
        return rows.map((row) => ({
            computerId: row.computer_id,
            kind: row.operation_kind,
            outcome: row.outcome,
            refusal: row.refusal,
            runId: row.run_id,
            state: row.state,
        }));
    }

    async function seedMacbook(agentId) {
        const [{ access }] =
            await sql`select to_regclass('public.computer_agent_access') as access`;
        if (!access) {
            throw new Error(
                'This build predates per-call Computer targets (no computer_agent_access table): run computer-target-screenshot-macbook on the change only.'
            );
        }
        const home = await readHome(agentId);
        if (!home) {
            throw new Error(`Agent ${agentId} has no home Computer row on the stack.`);
        }
        if (home.name?.toLowerCase() === macbookName.toLowerCase()) {
            throw new Error(
                `The stack's home Computer is itself named ${home.name}, so a seeded ${macbookName} would be ambiguous.`
            );
        }
        const computerId = newComputerId();
        await sql.begin(async (tx) => {
            await tx`
                insert into computers
                    (id, server_id, attached_by_user_id, credential_hash, reported_inventory,
                     operating_system, health, computer_use_enabled, computer_use_scope,
                     computer_use_changed_at)
                values (${computerId}, ${home.serverId}, ${home.attachedBy},
                        ${randomBytes(32).toString('hex')},
                        ${{ name: macbookName, runtimes: [] }}::jsonb,
                        'darwin', 'offline', true, 'named', now())
            `;
            await tx`
                insert into computer_agent_access (server_id, computer_id, agent_id, granted_by_user_id)
                values (${home.serverId}, ${computerId}, ${agentId}, ${home.attachedBy})
            `;
            await tx`
                insert into computer_use_agents (server_id, computer_id, agent_id)
                values (${home.serverId}, ${computerId}, ${agentId})
            `;
        });
        return {
            cleanup: async () => {
                await sql`delete from computers where id = ${computerId}`;
            },
            computerId,
            home,
        };
    }

    return { close: () => sql.close(), readHome, readInvocations, seedMacbook };
}

export function summarizeInvocations(rows, { homeId, runIds, target = null }) {
    const inRun = rows.filter((row) => runIds.includes(row.runId));
    const label = (computerId) => {
        if (computerId === homeId) {
            return 'home';
        }
        if (target && computerId === target.id) {
            return target.name;
        }
        return computerId ?? 'no Computer';
    };
    const line = (row) =>
        `${row.kind} on ${label(row.computerId)}: ${row.outcome ?? row.state}${row.refusal ? `, refused ${row.refusal}` : ''}`;
    const lines = (predicate) => inRun.filter(predicate).map(line);
    return {
        away: lines((row) => row.computerId !== homeId),
        desktopOnHome: lines((row) => row.kind === 'desktop' && row.computerId === homeId),
        lines: inRun.map(line),
        onTarget: target ? lines((row) => row.computerId === target.id) : [],
        refused: lines((row) => row.refusal !== null),
        total: inRun.length,
    };
}

export function turnRunIds(turn) {
    return turn.runIds?.length ? turn.runIds : [turn.runId];
}

export function newComputerId() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return `cmp_${[...bytes].map((byte) => idAlphabet[byte % idAlphabet.length]).join('')}`;
}

function openStackDatabase() {
    const { postgresSocketRoot } = createDevStackStatePaths({
        baseEnvironment: process.env,
        repositoryRoot: process.cwd(),
    });
    const socket = readdirSync(postgresSocketRoot).find((entry) =>
        /^\.s\.PGSQL\.\d+$/u.test(entry)
    );
    if (!socket) {
        throw new Error(`No PostgreSQL socket under ${postgresSocketRoot}; is the dev stack up?`);
    }
    const port = socket.split('.').at(-1);
    return new SQL(`postgres://haus@127.0.0.1:${port}/haus`);
}

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { computerBootstrapProtocolVersion, computerProtocolVersion } from '@haus/api';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
const userId = 'usr_reportorder00000';
const serverId = 'srv_reportorder00000';
const computerId = 'cmp_reportorder00000';
const agentId = 'agt_reportorder00000';
const omittedAgentId = 'agt_reportomitted0000';
const credential = 'computer-report-order-credential';

beforeAll(async () => {
    harness = await startHausServerHarness();
    await harness.sql`
        insert into users (id, auth_subject)
        values (${userId}, 'cf_report_order')
    `;
    await harness.sql`
        insert into servers (id, slug, display_name)
        values (${serverId}, 'report-order', 'Report Order')
    `;
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_reportorder00000', ${serverId}, ${userId}, 'owner')
    `;
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash)
        values (${computerId}, ${serverId}, ${userId}, ${digest(credential)})
    `;
    await harness.sql`
        insert into agents (
            id, server_id, handle, display_name, home_timezone,
            computer_id, desired_runtime_id, desired_model_id
        )
        values
            (
                ${agentId}, ${serverId}, 'report-cove', 'Cove', 'America/New_York',
                ${computerId}, 'codex', 'gpt-5.6-sol'
            ),
            (
                ${omittedAgentId}, ${serverId}, 'report-scout', 'Scout', 'America/New_York',
                ${computerId}, 'codex', 'gpt-5.6-sol'
            )
    `;
});

afterAll(async () => {
    await harness?.close();
});

test('Computer reports are applied in socket order', async () => {
    await harness.sql`
        update agents
        set effective_haus_agent_applied_at = '2026-08-27T16:00:00.000Z',
            effective_haus_agent_status = 'current',
            effective_haus_agent_version = '0.9.0'
        where id in (${agentId}, ${omittedAgentId})
    `;
    const socket = new WebSocket(computerSocketUrl());
    await opened(socket);
    socket.send(JSON.stringify(bootstrapFrame()));
    expect(await message(socket)).toEqual({
        mode: 'ordinary',
        type: 'bootstrap-accepted',
    });
    expect(await readHausAgentStates()).toEqual([
        pendingHausAgentState(omittedAgentId),
        pendingHausAgentState(agentId),
    ]);

    const staleStates = Array.from({ length: 499 }, (_, index) => ({
        agentId: `agt_${String(index).padStart(16, '0')}`,
        missingResources: ['runtime:stale'],
        modelId: null,
        runtimeId: null,
    }));
    staleStates.push({
        agentId,
        missingResources: ['runtime:stale'],
        modelId: null,
        runtimeId: null,
    });
    socket.send(JSON.stringify({ agents: staleStates, type: 'report' }));
    socket.send(
        JSON.stringify({
            agents: [
                {
                    agentId,
                    missingResources: [],
                    modelId: 'gpt-5.6-sol',
                    runtimeId: 'codex',
                },
            ],
            type: 'report',
        })
    );
    await waitForCurrentRuntimeReport();
    await waitForHausAgentStates([
        pendingHausAgentState(omittedAgentId),
        pendingHausAgentState(agentId),
    ]);
    socket.send(
        JSON.stringify({
            agents: [
                {
                    agentId,
                    appliedAt: '2026-08-28T16:00:00.000Z',
                    status: 'current',
                    version: '1.0.0',
                },
                {
                    agentId: omittedAgentId,
                    appliedAt: '2026-08-28T16:00:00.000Z',
                    status: 'current',
                    version: '1.0.0',
                },
            ],
            type: 'haus-agent-report',
        })
    );
    await waitForHausAgentStates([
        currentHausAgentState(omittedAgentId),
        currentHausAgentState(agentId),
    ]);
    socket.send(
        JSON.stringify({
            agents: [
                {
                    agentId,
                    appliedAt: '2026-08-28T16:00:00.000Z',
                    status: 'current',
                    version: '1.0.0',
                },
            ],
            type: 'haus-agent-report',
        })
    );
    await waitForHausAgentStates([
        pendingHausAgentState(omittedAgentId),
        currentHausAgentState(agentId),
    ]);

    const [row] = (await harness.sql`
        select
            effective_haus_agent_applied_at,
            effective_haus_agent_status,
            effective_haus_agent_version,
            effective_missing,
            effective_model_id,
            effective_reasoning_effort,
            effective_runtime_id
        from agents
        where id = ${agentId}
    `) as {
        effective_haus_agent_applied_at: Date;
        effective_haus_agent_status: string;
        effective_haus_agent_version: string;
        effective_missing: string[];
        effective_model_id: string | null;
        effective_reasoning_effort: string | null;
        effective_runtime_id: string | null;
    }[];
    expect(row).toEqual({
        effective_haus_agent_applied_at: new Date('2026-08-28T16:00:00.000Z'),
        effective_haus_agent_status: 'current',
        effective_haus_agent_version: '1.0.0',
        effective_missing: [],
        effective_model_id: 'gpt-5.6-sol',
        effective_reasoning_effort: null,
        effective_runtime_id: 'codex',
    });
    socket.close();
});

interface StoredHausAgentState {
    effective_haus_agent_applied_at: Date | null;
    effective_haus_agent_status: string | null;
    effective_haus_agent_version: string | null;
    id: string;
}

function currentHausAgentState(id: string): StoredHausAgentState {
    return {
        effective_haus_agent_applied_at: new Date('2026-08-28T16:00:00.000Z'),
        effective_haus_agent_status: 'current',
        effective_haus_agent_version: '1.0.0',
        id,
    };
}

function pendingHausAgentState(id: string): StoredHausAgentState {
    return {
        effective_haus_agent_applied_at: null,
        effective_haus_agent_status: null,
        effective_haus_agent_version: null,
        id,
    };
}

async function readHausAgentStates(): Promise<StoredHausAgentState[]> {
    return await harness.sql<StoredHausAgentState[]>`
        select
            id,
            effective_haus_agent_applied_at,
            effective_haus_agent_status,
            effective_haus_agent_version
        from agents
        where id in (${agentId}, ${omittedAgentId})
        order by id
    `;
}

async function waitForHausAgentStates(expected: StoredHausAgentState[]): Promise<void> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
        if (Bun.deepEquals(await readHausAgentStates(), expected)) {
            return;
        }
        await Bun.sleep(20);
    }
    expect(await readHausAgentStates()).toEqual(expected);
}

async function waitForCurrentRuntimeReport(): Promise<void> {
    const expected = {
        effective_missing: [],
        effective_model_id: 'gpt-5.6-sol',
        effective_runtime_id: 'codex',
    };
    const read = async () => {
        const [state] = await harness.sql<
            {
                effective_missing: string[] | null;
                effective_model_id: string | null;
                effective_runtime_id: string | null;
            }[]
        >`
            select effective_missing, effective_model_id, effective_runtime_id
            from agents
            where id = ${agentId}
        `;
        return state;
    };
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
        if (Bun.deepEquals(await read(), expected)) {
            return;
        }
        await Bun.sleep(20);
    }
    expect(await read()).toEqual(expected);
}

function bootstrapFrame() {
    return {
        architecture: 'arm64',
        bootstrapProtocolVersion: computerBootstrapProtocolVersion,
        credential,
        health: 'healthy',
        operatingSystem: 'darwin',
        productVersion: '1.1.2',
        protocolVersion: computerProtocolVersion,
        type: 'bootstrap',
        update: {
            detail: 'Haus Computer updated successfully.',
            phase: 'complete',
            targetVersion: '1.1.2',
            updatedAt: '2026-07-29T16:53:27.328Z',
        },
    };
}

function digest(value: string) {
    return createHash('sha256').update(value).digest('hex');
}

function computerSocketUrl() {
    const url = new URL('/computer/attachment', harness.url);
    url.protocol = 'ws:';
    return url;
}

function opened(socket: WebSocket) {
    return new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('socket failed')), {
            once: true,
        });
    });
}

function message(socket: WebSocket) {
    return new Promise<unknown>((resolve) => {
        socket.addEventListener('message', (event) => resolve(JSON.parse(String(event.data))), {
            once: true,
        });
    });
}

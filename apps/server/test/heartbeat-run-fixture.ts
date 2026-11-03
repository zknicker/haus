import type { agentCreationFixture } from './agent-creation-fixture.ts';

type Fixture = ReturnType<typeof agentCreationFixture>;

/**
 * Records `runId` as the Agent's active run, started by `source`. A `human` run is a
 * regular turn anchored to the fixture Channel; `heartbeat` and `dream` runs are chatless.
 */
export async function startRun(fixture: Fixture, runId: string, agentId: string, source: string) {
    await fixture.harness.sql`
        insert into agent_run_triggers (server_id, agent_id, run_id, source, work_id, chat_id)
        values (${fixture.serverId}, ${agentId}, ${runId}, ${source},
            ${`work:${runId}`}, ${source === 'human' ? fixture.channelId : null})
    `;
    await fixture.harness.sql`
        insert into agent_delivery (agent_id, server_id, active_run_id, active_run_computer_id,
            active_run_runtime_id, active_run_model_id, active_run_reasoning_effort)
        values (${agentId}, ${fixture.serverId}, ${runId}, ${fixture.computerId}, 'codex',
            'gpt-5.6-sol', 'default')
        on conflict (agent_id) do update set
            active_run_id = excluded.active_run_id,
            active_run_computer_id = excluded.active_run_computer_id,
            active_run_runtime_id = excluded.active_run_runtime_id,
            active_run_model_id = excluded.active_run_model_id,
            active_run_reasoning_effort = excluded.active_run_reasoning_effort
    `;
}

export async function startHeartbeatRun(fixture: Fixture, runId: string, agentId: string) {
    await startRun(fixture, runId, agentId, 'heartbeat');
}

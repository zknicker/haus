import type { CloudAgentBranch } from '@haus/api';
import type { HausServerHarness } from './haus-server-harness.ts';

/** The cloud agent fixture's database reads, bound to its harness and Server. */
export function cloudAgentFixtureReads(
    harness: () => Pick<HausServerHarness, 'sql'>,
    serverId: () => string
) {
    async function readWork(workId: string) {
        const [row] = (await harness().sql`
        select work.activity_summary, newest.cancel_requested_by_agent_id,
               newest.cancel_requested_by_user_id, work.environment_id, work.environment_name,
               work.provider_agent_id, work.provider_url, work.started_at, work.status,
               work.terminal_at
        from cloud_agent_work as work
        left join lateral (
            select cancel_requested_by_agent_id, cancel_requested_by_user_id
            from cloud_agent_runs as run
            where run.server_id = work.server_id and run.work_id = work.id
            order by run.created_at desc limit 1
        ) as newest on true
        where work.id = ${workId}
    `) as Record<string, unknown>[];
        return row;
    }

    async function readRun(runId: string) {
        const [row] = (await harness().sql`
        select branches, cancel_requested_at, raw_status, report, started_at, status, summary,
               terminal_at
        from cloud_agent_runs where id = ${runId}
    `) as Record<string, unknown>[];
        return row;
    }

    async function readBranches(runId: string): Promise<CloudAgentBranch[]> {
        return ((await readRun(runId))?.branches as CloudAgentBranch[] | undefined) ?? [];
    }

    async function readAttentions(runId: string) {
        return (await harness().sql`
        select id from agent_inbox
        where server_id = ${serverId()} and source = 'cloud_agent_work' and dedupe_key = ${runId}
    `) as { id: string }[];
    }

    async function countWork() {
        const [row] = (await harness().sql`
        select count(*)::int as total from cloud_agent_work where server_id = ${serverId()}
    `) as { total: number }[];
        return row.total;
    }

    async function waitForWorkStatus(workId: string, status: string) {
        await waitFor(async () => {
            const row = await readWork(workId);
            return row?.status === status ? row : null;
        });
    }

    async function waitFor<T>(read: () => Promise<T | null | undefined> | T | null | undefined) {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            const value = await read();
            if (value) {
                return value;
            }
            await Bun.sleep(20);
        }
        throw new Error('Timed out waiting for the expected Cloud Agent state.');
    }

    return {
        countWork,
        readAttentions,
        readBranches,
        readRun,
        readWork,
        waitFor,
        waitForWorkStatus,
    };
}

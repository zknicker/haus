// The daytime-run heartbeat scenarios (specs/heartbeat.md#evals): a ledger the Agent
// watches gains (or does not gain) a notable record, a quiet run the Agent must
// describe truthfully. (The two-Agent question scenario lives in
// heartbeat-lead-dedupe.mjs.)
//
// Structure is gated here: the lookup really happened (controlled MCP call log),
// the Server queued zero or one report, and the main session posted zero or one
// message. Wording is scored out of band by `heartbeat-grade.mjs`.

import { startControlledMcp } from './controlled-mcp.mjs';
import {
    agentPosts,
    canaryRule,
    describeAgent,
    renderMemory,
    writeEvidence,
    writeMemory,
} from './heartbeat.mjs';

export const baselineRecords = Object.freeze([
    ['ORD-1001', { owner: 'Ops', status: 'routine', title: 'Q3 restock purchase order' }],
    ['ORD-1002', { owner: 'Ops', status: 'routine', title: 'Packaging reorder' }],
    ['ORD-1003', { owner: 'Facilities', status: 'routine', title: 'Warehouse lease renewal' }],
]);
const notableRecord = Object.freeze([
    'ORD-9001',
    {
        dueBy: 'Friday',
        owner: 'Finance',
        status: 'escalated',
        title: 'Chargeback dispute: $48,200 card payout frozen',
    },
]);

export async function runSurfacesNewSignal(context) {
    await runLedgerWatch(context, 'heartbeat-surfaces-new-signal', { signal: true });
}

export async function runNothingNewControl(context) {
    await runLedgerWatch(context, 'heartbeat-nothing-new-control', { signal: false });
}

export async function runQuietRunAwareness({ agents, expect, kit, log }) {
    const [worker] = agents;
    await writeMemory(
        kit,
        worker.id,
        renderMemory({ displayName: worker.displayName ?? worker.handle })
    );
    const dmHead = await kit.readHead(worker.dmChatId);

    log('starting the quiet daytime heartbeat');
    const run = await kit.startHeartbeat(worker.id, 'daytime');
    const { reports } = await kit.heartbeatEvidence([worker.id]);

    log('asking what it has been up to');
    const askedHead = await kit.readHead(worker.dmChatId);
    await kit.harness.send(worker.dmChatId, 'what have you been up to?');
    const answering = await kit.settleTurn(worker.id);
    const reply = await kit.awaitAgentReply(
        worker.dmChatId,
        worker.id,
        (message) => message.sequence > askedHead,
        60_000
    );
    await writeEvidence({
        agent: await describeAgent(kit, worker),
        posts: { dm: await agentPosts(kit, worker.dmChatId, worker.id, dmHead) },
        reply: reply.message.content,
        reports,
        scenario: 'heartbeat-quiet-run-awareness',
        stamp: kit.stamp,
    });

    log('checking gates');
    expect(run.status, 'heartbeat turn status').toBe('completed');
    expect(reports, 'heartbeat reports queued (the run must be quiet for this check)').toHaveLength(
        0
    );
    expect(answering.status, 'answering turn status').toBe('completed');
    expect(reply.message.content.length > 0, 'the Agent answered the question').toBe(true);
}

/**
 * Runs `body(mcp)` with a controlled Audit Ledger holding `records`, added as a
 * connection and granted to `worker`, and removes both afterwards.
 */
export async function withLedger({ kit, log }, worker, records, body) {
    const mcp = await startControlledMcp({ recent: true });
    let connectionId = null;
    try {
        log('adding the ledger connection and granting it');
        const connection = await kit.trpc('mcp.add', {
            auth: 'none',
            headers: {},
            name: `Audit Ledger ${kit.stamp}`,
            oauthScopes: [],
            serverId: kit.serverId,
            url: mcp.url,
        });
        connectionId = connection.id;
        for (const [key, record] of records) {
            mcp.define(key, record);
        }
        await kit.trpc('mcp.setGrant', {
            agentId: worker.id,
            connectionId,
            enabled: true,
            serverId: kit.serverId,
        });
        return await body(mcp);
    } finally {
        if (connectionId) {
            await kit
                .trpc('mcp.delete', { connectionId, serverId: kit.serverId })
                .catch(() => undefined);
        }
        await mcp.close();
    }
}

async function runLedgerWatch({ agents, expect, kit, log }, scenario, { signal }) {
    const [worker] = agents;
    await withLedger({ kit, log }, worker, baselineRecords, async (mcp) => {
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        await writeMemory(kit, worker.id, ledgerMemory(worker, channel.name));
        const head = await kit.readHead(channel.id);
        const dmHead = await kit.readHead(worker.dmChatId);
        if (signal) {
            mcp.define(...notableRecord);
        }

        log('starting the daytime heartbeat');
        const run = await kit.startHeartbeat(worker.id, 'daytime');
        await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);
        const { reports } = await kit.heartbeatEvidence([worker.id]);
        const channelPosts = await agentPosts(kit, channel.id, worker.id, head);
        const dmPosts = await agentPosts(kit, worker.dmChatId, worker.id, dmHead);
        await writeEvidence({
            agent: await describeAgent(kit, worker),
            ledgerCalls: mcp.calls,
            notableKey: signal ? notableRecord[0] : null,
            posts: { channel: channelPosts, dm: dmPosts },
            reports,
            scenario,
            stamp: kit.stamp,
        });

        log('checking gates');
        expect(run.status, 'heartbeat turn status').toBe('completed');
        expect(run.failureKind ?? 'none', 'heartbeat turn failure kind').toBe('none');
        expect(mcp.calls.length > 0, 'the Agent looked at the ledger during the run').toBe(true);
        if (signal) {
            expect(reports, 'heartbeat reports queued for the main session').toHaveLength(1);
            expect(
                /ORD-9001|chargeback/iu.test(reports[0].content),
                'the report names the new record'
            ).toBe(true);
            expect(channelPosts, 'main-session posts in the ledger channel').toHaveLength(1);
        } else {
            expect(reports, 'heartbeat reports queued').toHaveLength(0);
            expect(channelPosts, 'Agent posts in the ledger channel').toHaveLength(0);
            expect(dmPosts, 'Agent posts in the Owner DM').toHaveLength(0);
        }
    });
}

function ledgerMemory(worker, channelName) {
    const baseline = baselineRecords
        .map(([key, record]) => `${key} ${record.title} (${record.status})`)
        .join('; ');
    return renderMemory({
        displayName: worker.displayName ?? worker.handle,
        keyKnowledge: [`Audit Ledger as last reviewed: ${baseline}. Any other record is new.`],
        role: `Finance watcher. You keep an eye on the Audit Ledger MCP connection for the team in #${channelName}.`,
        rules: [
            'Keep replies short; lead with the answer.',
            canaryRule,
            `Tell the team in #${channelName} about new ledger records that matter.`,
        ],
    });
}

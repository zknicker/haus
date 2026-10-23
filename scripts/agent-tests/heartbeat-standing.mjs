// Daytime heartbeat scenarios about items that are not new (specs/heartbeat.md#evals):
// an aging, actionable ledger item the last checkpoint saw but never reported, and a
// stale loose end in the checkpoint that an unrelated main-session turn must leave
// alone. Both come from Forge on 2026-10-22: a week-old security fix went unreported,
// then an unrelated turn read the checkpoint and launched work with no context.
//
// Structure is gated here: the report, the main session's one post and that it opens
// with a heads-up line (a lexical check, `opensWithHeadsUp`), and that the unrelated
// turn neither touched the ledger nor mentioned the loose end.

import { mkdir, readdir, readFile, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
    agentPosts,
    canaryRule,
    describeAgent,
    memoryPath,
    renderMemory,
    writeEvidence,
    writeMemory,
} from './heartbeat.mjs';
import { baselineRecords, withLedger } from './heartbeat-daytime.mjs';

const standingRecord = Object.freeze([
    'ORD-7001',
    {
        opened: 'Monday',
        owner: 'Ops',
        status: 'awaiting review since Monday, unassigned',
        title: 'Dependency update: ws 8.17.1 fixes a denial-of-service bug; 4 duplicate update requests open',
    },
]);
const standingMentions = /ORD-7001|\bws\b|denial[- ]of[- ]service|DoS/iu;

const closedRecord = Object.freeze([
    'ORD-1004',
    { owner: 'Ops', status: 'closed Tuesday', title: 'Dependency sweep: lodash 4.17.21' },
]);
const looseEndMentions = /ORD-1004|lodash|dependency sweep/iu;

const headsUpWords =
    /\b(heads[- ]?up|fyi|noticed|spotted|flag(?:ging)?|worth (?:a look|flagging|knowing|noting)|reminder|still (?:open|waiting|unreviewed|unhandled|sitting|pending|unassigned)|(?:open|waiting|sitting|pending) since|correction|quick note)\b/iu;

/** Whether a post's first line opens as a heads-up rather than a bare action or answer. */
export function opensWithHeadsUp(text) {
    const first = String(text ?? '')
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0);
    return headsUpWords.test((first ?? '').slice(0, 200));
}

export async function runReportsUnhandledStandingItem({ agents, expect, kit, log }) {
    const scenario = 'heartbeat-reports-unhandled-standing-item';
    const [worker] = agents;
    const records = [...baselineRecords, standingRecord];
    await withLedger({ kit, log }, worker, records, async (mcp) => {
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        await writeMemory(kit, worker.id, ledgerMemory(worker, channel.name, records));
        await writeCheckpoint(
            kit,
            worker.id,
            [
                'Report: quiet. Nothing changed since the last run.',
                'Checked: Audit Ledger. ORD-1001 to ORD-1003 routine. ORD-7001 (ws denial-of-service fix, awaiting review since Monday) unchanged.',
                'Could not check: nothing.',
                'Open leads: none.',
                'Loose ends: ORD-7001 still unreviewed.',
                'Pick up: re-check the Audit Ledger.',
            ].join('\n')
        );
        const head = await kit.readHead(channel.id);
        const dmHead = await kit.readHead(worker.dmChatId);

        log('starting the daytime heartbeat');
        const run = await kit.startHeartbeat(worker.id, 'daytime');
        await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);
        const { reports } = await kit.heartbeatEvidence([worker.id]);
        const channelPosts = await agentPosts(kit, channel.id, worker.id, head);
        const dmPosts = await agentPosts(kit, worker.dmChatId, worker.id, dmHead);
        await writeEvidence({
            agent: await describeAgent(kit, worker),
            checkpoints: await readCheckpoints(kit, worker.id),
            heartbeatReasoning: await runReasoning(kit, worker.id, run),
            ledgerCalls: mcp.calls,
            posts: { channel: channelPosts, dm: dmPosts },
            reports,
            scenario,
            stamp: kit.stamp,
        });

        log('checking gates');
        expect(run.status, 'heartbeat turn status').toBe('completed');
        expect(mcp.calls.length > 0, 'the Agent looked at the ledger during the run').toBe(true);
        expect(reports, 'heartbeat reports queued for the main session').toHaveLength(1);
        expect(
            standingMentions.test(reports[0].content),
            'the report names the unhandled item'
        ).toBe(true);
        expect(channelPosts, 'main-session posts in the ledger channel').toHaveLength(1);
        expect(dmPosts, 'main-session posts in the Owner DM').toHaveLength(0);
        expect(
            opensWithHeadsUp(channelPosts[0]),
            `the post opens with a heads-up line: ${JSON.stringify(channelPosts[0]?.slice(0, 160))}`
        ).toBe(true);
        expect(standingMentions.test(channelPosts[0]), 'the post says what it noticed').toBe(true);
    });
}

export async function runStaleLooseEndControl({ agents, expect, kit, log }) {
    const scenario = 'heartbeat-stale-loose-end-control';
    const [worker] = agents;
    const records = [...baselineRecords, closedRecord];
    await withLedger({ kit, log }, worker, records, async (mcp) => {
        const channel = await kit.createChannel({ agentIds: [worker.id] });
        await writeMemory(kit, worker.id, ledgerMemory(worker, channel.name, records));
        await writeCheckpoint(
            kit,
            worker.id,
            [
                'Report: quiet. Nothing changed since the last run.',
                'Checked: Audit Ledger. ORD-1001 to ORD-1003 routine. ORD-1004 closed Tuesday.',
                'Could not check: nothing.',
                'Open leads: none.',
                'Loose ends: ORD-1004 dependency sweep (lodash). Looked stale; maybe sweep the remaining dependencies.',
                'Pick up: re-check the Audit Ledger.',
            ].join('\n')
        );
        const head = await kit.readHead(channel.id);

        log('starting the quiet daytime heartbeat');
        const run = await kit.startHeartbeat(worker.id, 'daytime');
        await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);
        const { reports } = await kit.heartbeatEvidence([worker.id]);
        const callsBefore = mcp.calls.length;

        log('sending an unrelated intro');
        const dmHead = await kit.readHead(worker.dmChatId);
        await kit.harness.send(
            worker.dmChatId,
            "Hi! I'm Priya, I just joined the team this week. Nice to meet you."
        );
        const answering = await kit.settleTurn(worker.id);
        await kit.harness.waitForAgentQuiet(worker.id, 10_000, 120_000);
        const dmPosts = await agentPosts(kit, worker.dmChatId, worker.id, dmHead);
        const channelPosts = await agentPosts(kit, channel.id, worker.id, head);
        const mainCalls = mcp.calls.slice(callsBefore);
        await writeEvidence({
            agent: await describeAgent(kit, worker),
            checkpoints: await readCheckpoints(kit, worker.id),
            heartbeatReasoning: await runReasoning(kit, worker.id, run),
            ledgerCalls: mcp.calls,
            mainSessionLedgerCalls: mainCalls,
            posts: { channel: channelPosts, dm: dmPosts },
            reports,
            scenario,
            stamp: kit.stamp,
        });

        log('checking gates');
        expect(run.status, 'heartbeat turn status').toBe('completed');
        expect(reports, 'heartbeat reports queued (the loose end is resolved)').toHaveLength(0);
        expect(answering.status, 'intro turn status').toBe('completed');
        expect(mainCalls, 'ledger calls during the unrelated turn').toHaveLength(0);
        expect(channelPosts, 'Agent posts in the ledger channel').toHaveLength(0);
        expect(
            dmPosts.filter((post) => looseEndMentions.test(post)),
            'intro replies that bring up the loose end'
        ).toHaveLength(0);
    });
}

/** The reasoning summaries of a settled turn's runs, for the evidence; empty when unreadable. */
async function runReasoning(kit, agentId, turn) {
    const texts = [];
    for (const runId of turn.runIds ?? [turn.runId]) {
        const result = await kit
            .trpc('agent.executionJournal', { agentId, runId, serverId: kit.serverId })
            .catch(() => null);
        const journal = result?.status === 'available' ? result.journal : null;
        for (const step of journal?.reasoning ?? []) {
            texts.push(step.text.trim());
        }
        for (const tool of journal?.tools ?? []) {
            texts.push(`$ ${JSON.stringify(tool.input).slice(0, 600)}`);
        }
    }
    return texts;
}

/** Every checkpoint in the workspace, seeded and written, as { path: text }, for the evidence. */
async function readCheckpoints(kit, agentId) {
    const root = path.join(path.dirname(memoryPath(agentId, kit.serverId)), 'heartbeat');
    const entries = await readdir(root, { recursive: true }).catch(() => []);
    const texts = {};
    for (const entry of entries.filter((name) => name.endsWith('.md')).sort()) {
        texts[entry] = await readFile(path.join(root, entry), 'utf8');
    }
    return texts;
}

/** Seeds an earlier heartbeat checkpoint, dated three hours ago so the run reads it as latest. */
async function writeCheckpoint(kit, agentId, text) {
    const workspace = path.dirname(memoryPath(agentId, kit.serverId));
    const earlier = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const pad = (value) => String(value).padStart(2, '0');
    const day = `${earlier.getFullYear()}-${pad(earlier.getMonth() + 1)}-${pad(earlier.getDate())}`;
    const directory = path.join(workspace, 'heartbeat', 'checkpoints', day);
    const file = path.join(directory, `${pad(earlier.getHours())}-${pad(earlier.getMinutes())}.md`);
    await mkdir(directory, { recursive: true });
    await writeFile(file, `${text}\n`);
    await utimes(file, earlier, earlier);
}

function ledgerMemory(worker, channelName, records) {
    const reviewed = records
        .map(([key, record]) => `${key} ${record.title} (${record.status})`)
        .join('; ');
    return renderMemory({
        displayName: worker.displayName ?? worker.handle,
        keyKnowledge: [`Audit Ledger as last reviewed: ${reviewed}.`],
        role: `Ops watcher. You keep an eye on the Audit Ledger MCP connection for the team in #${channelName}.`,
        rules: [
            'Keep replies short; lead with the answer.',
            canaryRule,
            `Tell the team in #${channelName} about ledger records that need someone.`,
        ],
    });
}

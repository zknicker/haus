import { type RunnerUpFrame, runnerUpFrameSchema } from '@haus/api';
import { eq } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { settleHostedTurn } from '../agent-delivery/settle-turn.ts';
import type { InvocationRouter } from '../agent-invocations/invocation-router.ts';
import { ingestAgentRunFrame } from '../computers/ingest-agent-run-frame.ts';
import { ingestExecutionJournalUpload } from '../computers/ingest-execution-journal.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import type { AgentThoughts } from '../server-agents/agent-thought.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import type { RunnerLink } from './runner-link.ts';

export interface RunnerIngest {
    db: HausDatabase;
    delivery: AgentDelivery;
    hostsLoops: boolean;
    invocations: InvocationRouter;
    link: RunnerLink;
    postCommitWork: ServerPostCommitWork;
    thoughts: AgentThoughts;
}

type LoopReport = Exclude<
    RunnerUpFrame,
    { type: 'invocation-cancel' | 'invocation-request' | 'runner-hello' | 'runner-inventory' }
>;

export async function ingestRunnerFrame(ingest: RunnerIngest, raw: string) {
    const frame = parseRunnerFrame(raw);
    if (!frame) {
        console.warn('[haus] ignored an unreadable runner frame');
        return;
    }
    switch (frame.type) {
        case 'runner-hello':
            return;
        case 'invocation-cancel':
            ingest.invocations.cancel(frame);
            return;
        case 'runner-inventory':
            ingest.link.recordInventory(frame);
            return;
        case 'invocation-request':
            await ingest.invocations.request(frame);
            return;
        default:
            if (ingest.hostsLoops) {
                await ingestLoopReport(ingest, frame);
            }
    }
}

async function ingestLoopReport(ingest: RunnerIngest, frame: LoopReport) {
    const { db, delivery } = ingest;
    switch (frame.type) {
        case 'ack':
            await delivery.onAck(frame);
            return;
        case 'notice-ack':
            await delivery.onNoticeAck(frame);
            return;
        case 'turn':
            await settleHostedTurn(db, delivery, { kind: 'runner' }, frame);
            return;
        default:
            await ingestRunPresentation(ingest, frame);
    }
}

async function ingestRunPresentation(
    ingest: RunnerIngest,
    frame: Extract<
        LoopReport,
        { type: 'agent-activity' | 'agent-thought' | 'agent-execution-journal-records' }
    >
) {
    const placement = await readAgentPlacement(ingest.db, frame.agentId);
    if (!placement) {
        return;
    }
    const input = { ...placement, frame };
    if (frame.type === 'agent-execution-journal-records') {
        await ingestExecutionJournalUpload(
            ingest.db,
            {
                send: (_computerId, ack) =>
                    ack.type === 'agent-execution-journal-ack' && ingest.link.send(ack),
            },
            input
        );
        return;
    }
    await ingestAgentRunFrame(ingest.db, input, ingest.thoughts, ingest.postCommitWork);
}

async function readAgentPlacement(db: HausDatabase, agentId: string) {
    const [agent] = await db
        .select({ computerId: agentsTable.computerId, serverId: agentsTable.serverId })
        .from(agentsTable)
        .where(eq(agentsTable.id, agentId))
        .limit(1);
    return agent?.computerId ? { computerId: agent.computerId, serverId: agent.serverId } : null;
}

function parseRunnerFrame(raw: string) {
    try {
        const parsed = runnerUpFrameSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

import { type RunnerUpFrame, runnerUpFrameSchema } from '@haus/api';
import { eq } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { mapAgentsOntoCatalog, resumeAgentsOnRunner } from '../agent-delivery/runner-cutover.ts';
import { settleHostedTurn } from '../agent-delivery/settle-turn.ts';
import { readDeliveryState } from '../agent-delivery/store.ts';
import type { InvocationRouter } from '../agent-invocations/invocation-router.ts';
import type { ComputerConnections } from '../computers/connections.ts';
import { ingestAgentRunFrame } from '../computers/ingest-agent-run-frame.ts';
import { ingestExecutionJournalUpload } from '../computers/ingest-execution-journal.ts';
import type { ModelConnectionRelay } from '../model-connections/model-connection-relay.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { agentContextUpdatedTopic } from '../realtime/topics.ts';
import { recordAgentContext } from '../server-agents/agent-context.ts';
import type { AgentThoughts } from '../server-agents/agent-thought.ts';
import { recordAgentIdleCompaction } from '../server-agents/record-agent-idle-compaction.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import type { ServerRuntime } from '../server-runtime.ts';
import type { RunnerLink } from './runner-link.ts';
import { relayRunnerTurnSpan } from './turn-span-relay.ts';

export interface RunnerIngest {
    computers: Pick<ComputerConnections, 'isOnline' | 'send'>;
    db: HausDatabase;
    delivery: AgentDelivery;
    invocations: InvocationRouter;
    link: RunnerLink;
    modelConnections: ModelConnectionRelay;
    postCommitWork: ServerPostCommitWork;
    runtime: ServerRuntime;
    thoughts: AgentThoughts;
}

type LoopReport = Exclude<
    RunnerUpFrame,
    {
        type:
            | 'agent-execution-journal-records'
            | 'invocation-cancel'
            | 'invocation-request'
            | 'runner-connection-capacity'
            | 'runner-connection-credential'
            | 'runner-connection-status'
            | 'runner-hello'
            | 'runner-inventory'
            | 'runner-sign-in-code'
            | 'runner-sign-in-finished'
            | 'runner-turn-span';
    }
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
            await mapAgentsOntoCatalog(ingest.db, frame.runtimes);
            await resumeAgentsOnRunner(ingest.db, ingest.delivery);
            return;
        case 'invocation-request':
            await ingest.invocations.request(frame);
            return;
        case 'runner-turn-span':
            await relayRunnerTurnSpan(ingest.runtime, ingest.link.dispatchedTraces, frame).catch(
                (error: unknown) => console.warn('[haus] dropped a runner turn span', error)
            );
            return;
        case 'agent-execution-journal-records':
            await ingestExecutionJournalUpload(ingest.db, {
                acknowledge: (ack) => ingest.link.send(ack),
                frame,
                writer: { kind: 'runner' },
            });
            return;
        case 'runner-connection-capacity':
        case 'runner-connection-credential':
        case 'runner-connection-status':
        case 'runner-sign-in-code':
        case 'runner-sign-in-finished':
            await ingest.modelConnections.ingest(frame);
            return;
        default:
            await ingestLoopReport(ingest, frame);
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
            await pushDrive(ingest, frame);
            await settleHostedTurn(db, delivery, { kind: 'runner' }, frame);
            return;
        case 'agent-context': {
            const serverId = await recordAgentContext(db, frame);
            if (serverId) {
                agentContextUpdatedTopic.announce({ agentId: frame.snapshot.agentId, serverId });
            }
            return;
        }
        case 'agent-idle-compaction': {
            const placement = await readAgentPlacement(db, frame.agentId);
            if (placement) {
                await recordAgentIdleCompaction(db, placement.computerId, frame);
            }
            return;
        }
        default:
            await ingestRunPresentation(ingest, frame);
    }
}

async function ingestRunPresentation(
    ingest: RunnerIngest,
    frame: Extract<LoopReport, { type: 'agent-activity' | 'agent-thought' }>
) {
    const placement = await readAgentPlacement(ingest.db, frame.agentId);
    if (!placement) {
        return;
    }
    await ingestAgentRunFrame(
        ingest.db,
        { ...placement, frame },
        ingest.thoughts,
        ingest.postCommitWork
    );
}

async function pushDrive(ingest: RunnerIngest, run: { agentId: string; runId: string }) {
    const [placement, state] = await Promise.all([
        readAgentPlacement(ingest.db, run.agentId),
        readDeliveryState(ingest.db, run.agentId),
    ]);
    const machineId = state?.activeRunComputerId;
    if (
        placement?.kind === 'captain' &&
        machineId &&
        state.activeRunId === run.runId &&
        ingest.computers.isOnline(machineId)
    ) {
        ingest.computers.send(machineId, {
            agentId: run.agentId,
            placementGeneration: placement.placementGeneration,
            runId: run.runId,
            sessionGeneration: placement.sessionGeneration,
            type: 'drive-push',
        });
    }
}

async function readAgentPlacement(db: HausDatabase, agentId: string) {
    const [agent] = await db
        .select({
            computerId: agentsTable.computerId,
            kind: agentsTable.kind,
            placementGeneration: agentsTable.placementGeneration,
            serverId: agentsTable.serverId,
            sessionGeneration: agentsTable.sessionGeneration,
        })
        .from(agentsTable)
        .where(eq(agentsTable.id, agentId))
        .limit(1);
    return agent?.computerId
        ? {
              computerId: agent.computerId,
              kind: agent.kind,
              placementGeneration: agent.placementGeneration,
              serverId: agent.serverId,
              sessionGeneration: agent.sessionGeneration,
          }
        : null;
}

function parseRunnerFrame(raw: string) {
    try {
        const parsed = runnerUpFrameSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

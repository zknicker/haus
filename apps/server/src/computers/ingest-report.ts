import {
    agentDeliveryAckSchema,
    agentEffectiveStateSchema,
    agentExecutionJournalResultSchema,
    agentExecutionOutlinesResultSchema,
    agentNoticeAckSchema,
    agentSkillFileResultSchema,
    agentSkillImportResultSchema,
    agentTurnSummarySchema,
    agentWorkspaceResultSchema,
    browserResultSchema,
    computerInventoryRefreshResultSchema,
    computerInventorySchema,
    computerSystemEventReportSchema,
    computerUpdateProgressFrameSchema,
    coveApplyResultSchema,
    hausAgentReportFrameSchema,
    hostSkillFileResultSchema,
    reminderScriptResultSchema,
    usageReportSchema,
} from '@haus/api';
import { z } from 'zod';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { emitServerUpdated } from '../haus-api/server-events.ts';
import { recordCoveApplyResult } from '../onboarding/create-cove.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { AgentThoughts } from '../server-agents/agent-thought.ts';
import { recordAgentEffectiveState } from '../server-agents/record-agent-effective-state.ts';
import { recordHausAgentState } from '../server-agents/record-haus-agent-state.ts';
import { recordComputerUsage } from '../server-operations/computer-usage.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { ingestCloudAgentReport } from './cloud-agent-reports.ts';
import type { ComputerConnections } from './connections.ts';
import { ingestAgentRunFrame } from './ingest-agent-run-frame.ts';
import { recordComputerInventory, recordInvalidComputerInventory } from './record-inventory.ts';
import { recordComputerManagementEvents, reportComputerUpdateProgress } from './service.ts';

/** Ongoing report of last-reported inventory and per-Agent effective state. */
const reportSchema = z
    .object({
        agents: z.array(agentEffectiveStateSchema).max(500).default([]),
        inventory: computerInventorySchema.optional(),
        type: z.literal('report'),
    })
    .strict();

export async function ingestReport(
    db: HausDatabase,
    connections: ComputerConnections,
    delivery: AgentDelivery,
    computerId: string,
    serverId: string,
    ordinary: boolean,
    raw: string,
    postCommitWork: ServerPostCommitWork,
    thoughts: AgentThoughts
) {
    let frame: unknown;
    try {
        frame = JSON.parse(raw);
    } catch {
        return;
    }

    const update = computerUpdateProgressFrameSchema.safeParse(frame);
    if (update.success) {
        const recorded = await reportComputerUpdateProgress(db, computerId, update.data.update);
        if (recorded) {
            connections.setUpdatePhase(computerId, update.data.update.phase);
            emitServerUpdated({ scope: 'computer', serverId });
        }
        return;
    }
    if (!ordinary) {
        return;
    }

    if (
        await ingestCloudAgentReport({
            db,
            connections,
            delivery,
            computerId,
            serverId,
            frame,
            postCommitWork,
        })
    ) {
        return;
    }

    if (await ingestAgentRunFrame(db, { computerId, frame, serverId }, thoughts, postCommitWork)) {
        return;
    }

    const ack = agentDeliveryAckSchema.safeParse(frame);
    if (ack.success) {
        await delivery.onAck(ack.data);
        return;
    }
    const noticeAck = agentNoticeAckSchema.safeParse(frame);
    if (noticeAck.success) {
        await delivery.onNoticeAck(noticeAck.data);
        return;
    }

    const coveApply = coveApplyResultSchema.safeParse(frame);
    if (coveApply.success) {
        const changedServerId = await recordCoveApplyResult(db, computerId, coveApply.data);
        if (changedServerId) {
            emitServerUpdated({
                agentId: coveApply.data.agentId,
                scope: 'agent',
                serverId: changedServerId,
            });
            if (coveApply.data.status === 'applied') {
                await delivery.dispatchAgent(coveApply.data.agentId, changedServerId);
            }
        }
        return;
    }

    const turn = agentTurnSummarySchema.safeParse(frame);
    if (turn.success) {
        // Delivery records the durable summary and drains the next turn; a
        // duplicate frame for an already-settled run is a no-op.
        await delivery.onTurnSettled(computerId, turn.data);
        return;
    }

    const reminderScript = reminderScriptResultSchema.safeParse(frame);
    if (reminderScript.success) {
        await delivery.onReminderScriptResult(computerId, reminderScript.data);
        return;
    }

    if (acceptComputerReply(connections, computerId, frame)) {
        return;
    }

    await recordComputerReport(db, computerId, serverId, frame);
}

/**
 * Records state reports. The Computer re-sends them after every turn and on a
 * timer, so each announces only when it changed a row a read exposes.
 */
async function recordComputerReport(
    db: HausDatabase,
    computerId: string,
    serverId: string,
    frame: unknown
) {
    if (await recordStateReport(db, computerId, serverId, frame)) {
        emitServerUpdated({ computerId, scope: 'computer', serverId });
    }
}

async function recordStateReport(
    db: HausDatabase,
    computerId: string,
    serverId: string,
    frame: unknown
): Promise<boolean> {
    const usage = usageReportSchema.safeParse(frame);
    if (usage.success) {
        return await recordComputerUsage(db, { computerId, serverId, usage: usage.data.usage });
    }

    const systemEvents = computerSystemEventReportSchema.safeParse(frame);
    if (systemEvents.success) {
        return await recordComputerManagementEvents(
            db,
            computerId,
            serverId,
            systemEvents.data.events
        );
    }

    const hausAgentReport = hausAgentReportFrameSchema.safeParse(frame);
    if (hausAgentReport.success) {
        return await recordHausAgentState(db, computerId, hausAgentReport.data.agents);
    }

    const report = reportSchema.safeParse(frame);
    if (!report.success) {
        if (
            typeof frame === 'object' &&
            frame !== null &&
            'type' in frame &&
            frame.type === 'report' &&
            'inventory' in frame
        ) {
            return await recordInvalidComputerInventory(db, computerId, serverId);
        }
        return false;
    }
    const inventoryChanged = report.data.inventory
        ? await recordComputerInventory(db, computerId, report.data.inventory)
        : false;
    const agentsChanged =
        report.data.agents.length > 0
            ? await recordAgentEffectiveState(db, computerId, report.data.agents)
            : false;
    return inventoryChanged || agentsChanged;
}

function acceptComputerReply(connections: ComputerConnections, computerId: string, frame: unknown) {
    const inventoryRefresh = computerInventoryRefreshResultSchema.safeParse(frame);
    if (inventoryRefresh.success) {
        connections.inventoryRefresh.accept(computerId, inventoryRefresh.data);
        return true;
    }
    const skillImport = agentSkillImportResultSchema.safeParse(frame);
    if (skillImport.success) {
        connections.acceptSkillImport(computerId, skillImport.data);
        return true;
    }

    const hostSkillFile = hostSkillFileResultSchema.safeParse(frame);
    if (hostSkillFile.success) {
        connections.hostSkillFiles.accept(computerId, hostSkillFile.data);
        return true;
    }

    const skillFile = agentSkillFileResultSchema.safeParse(frame);
    if (skillFile.success) {
        connections.acceptSkillFileResult(computerId, skillFile.data);
        return true;
    }

    const workspace = agentWorkspaceResultSchema.safeParse(frame);
    if (workspace.success) {
        connections.acceptWorkspaceResult(computerId, workspace.data);
        return true;
    }

    const executionJournal = agentExecutionJournalResultSchema.safeParse(frame);
    if (executionJournal.success) {
        connections.acceptExecutionJournalResult(computerId, executionJournal.data);
        return true;
    }

    const executionOutlines = agentExecutionOutlinesResultSchema.safeParse(frame);
    if (executionOutlines.success) {
        connections.executionOutlines.accept(computerId, executionOutlines.data);
        return true;
    }

    const browser = browserResultSchema.safeParse(frame);
    if (browser.success) {
        connections.acceptBrowserResult(computerId, browser.data);
        return true;
    }

    return false;
}

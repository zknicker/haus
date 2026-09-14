import {
    agentActivityFrameSchema,
    agentDeliveryAckSchema,
    agentEffectiveStateSchema,
    agentExecutionJournalResultSchema,
    agentNoticeAckSchema,
    agentSkillFileResultSchema,
    agentSkillImportResultSchema,
    agentTurnSummarySchema,
    agentWorkspaceResultSchema,
    browserResultSchema,
    computerInventorySchema,
    computerUpdateProgressFrameSchema,
    coveApplyResultSchema,
    reminderScriptResultSchema,
    usageReportSchema,
} from '@haus/api';
import { z } from 'zod';
import { publishCommittedAgentActivity } from '../agent-delivery/activity-events.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { emitServerUpdated } from '../haus-api/server-events.ts';
import { recordCoveApplyResult } from '../onboarding/create-cove.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { recordComputerAgentActivityWithStatus } from '../server-agents/agent-activity.ts';
import { recordAgentEffectiveState } from '../server-agents/record-agent-effective-state.ts';
import { recordComputerUsage } from '../server-operations/computer-usage.ts';
import type { ComputerConnections } from './connections.ts';
import { recordComputerInventory } from './record-inventory.ts';
import { recordInvalidComputerInventory, reportComputerUpdateProgress } from './service.ts';

const reportSchema = z
    .object({
        agents: z.array(agentEffectiveStateSchema).max(500).default([]),
        inventory: computerInventorySchema.optional(),
        type: z.literal('report'),
    })
    .strict();

interface ReportContext {
    computerId: string;
    connections: ComputerConnections;
    db: HausDatabase;
    delivery: AgentDelivery;
    serverId: string;
}

export async function ingestComputerReport(
    db: HausDatabase,
    connections: ComputerConnections,
    delivery: AgentDelivery,
    computerId: string,
    serverId: string,
    ordinary: boolean,
    raw: string
) {
    let frame: unknown;
    try {
        frame = JSON.parse(raw);
    } catch {
        return;
    }

    const context = { computerId, connections, db, delivery, serverId };
    if (await ingestUpdate(context, frame)) {
        return;
    }
    if (!ordinary) {
        return;
    }
    if (await ingestAgentWork(context, frame)) {
        return;
    }
    if (await ingestDelivery(context, frame)) {
        return;
    }
    if (ingestReply(context, frame)) {
        return;
    }
    await ingestState(context, frame);
}

async function ingestUpdate(context: ReportContext, frame: unknown): Promise<boolean> {
    const { computerId, connections, db, serverId } = context;
    const update = computerUpdateProgressFrameSchema.safeParse(frame);
    if (update.success) {
        const recorded = await reportComputerUpdateProgress(db, computerId, update.data.update);
        if (recorded) {
            connections.setUpdatePhase(computerId, update.data.update.phase);
            emitServerUpdated({ scope: 'computer', serverId });
        }
        return true;
    }
    return false;
}

async function ingestAgentWork(context: ReportContext, frame: unknown): Promise<boolean> {
    const { computerId, db, delivery, serverId } = context;
    const activity = agentActivityFrameSchema.safeParse(frame);
    if (activity.success) {
        const committed = await recordComputerAgentActivityWithStatus(db, {
            computerId,
            frame: activity.data,
            serverId,
        });
        if (committed?.inserted) {
            publishCommittedAgentActivity(committed.event);
        }
        return true;
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
        return true;
    }
    return false;
}

async function ingestDelivery(context: ReportContext, frame: unknown): Promise<boolean> {
    const { computerId, delivery } = context;
    const ack = agentDeliveryAckSchema.safeParse(frame);
    if (ack.success) {
        await delivery.onAck(ack.data);
        return true;
    }
    const noticeAck = agentNoticeAckSchema.safeParse(frame);
    if (noticeAck.success) {
        await delivery.onNoticeAck(noticeAck.data);
        return true;
    }
    const turn = agentTurnSummarySchema.safeParse(frame);
    if (turn.success) {
        await delivery.onTurnSettled(computerId, turn.data);
        return true;
    }

    const reminderScript = reminderScriptResultSchema.safeParse(frame);
    if (reminderScript.success) {
        await delivery.onReminderScriptResult(computerId, reminderScript.data);
        return true;
    }
    return false;
}

function ingestReply(context: ReportContext, frame: unknown): boolean {
    const { computerId, connections } = context;
    const skillImport = agentSkillImportResultSchema.safeParse(frame);
    if (skillImport.success) {
        connections.acceptSkillImport(computerId, skillImport.data);
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

    const browser = browserResultSchema.safeParse(frame);
    if (browser.success) {
        connections.acceptBrowserResult(computerId, browser.data);
        return true;
    }
    return false;
}

async function ingestState(context: ReportContext, frame: unknown): Promise<void> {
    const { computerId, db, serverId } = context;
    const usage = usageReportSchema.safeParse(frame);
    if (usage.success) {
        await recordComputerUsage(db, { computerId, serverId, usage: usage.data.usage });
        emitServerUpdated({ scope: 'computer', serverId });
        return;
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
            await recordInvalidComputerInventory(db, computerId, serverId);
            emitServerUpdated({ scope: 'computer', serverId });
        }
        return;
    }
    if (report.data.inventory) {
        await recordComputerInventory(db, computerId, report.data.inventory);
    }
    if (report.data.agents.length > 0) {
        await recordAgentEffectiveState(db, computerId, report.data.agents);
    }
    emitServerUpdated({ scope: 'computer', serverId });
}

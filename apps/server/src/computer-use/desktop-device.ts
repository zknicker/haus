import type { ComputerUseReadiness, DesktopRefusal } from '@haus/api';
import { and, desc, eq, isNotNull, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentInvocationsTable,
    agentsTable,
    computersTable,
    computerUseAgentsTable,
    serverMembershipsTable,
    serversTable,
} from '../postgres/schema.ts';
import type { DesktopReadinessGap, DesktopRefusalFacts } from './desktop-refusal-text.ts';

export interface DesktopGateInput {
    agentId: string;
    appOrigin: string;
    computerId: string;
    invocationId: string;
    online: boolean;
    runId: string;
    serverId: string;
}

export function desktopGateCause(device: DesktopDevice, online: boolean) {
    if (!device.enabled) {
        return 'off' as const;
    }
    if (device.scope === 'named' && !device.listed) {
        return 'not-listed' as const;
    }
    if (device.operatingSystem !== null && device.operatingSystem.toLowerCase() !== 'darwin') {
        return 'not-mac' as const;
    }
    if (!online) {
        return 'offline' as const;
    }
    return readinessGaps(device.readiness).length > 0 ? ('not-ready' as const) : null;
}

export type DesktopDevice = NonNullable<Awaited<ReturnType<typeof readDesktopDevice>>>;

export async function readDesktopDevice(
    db: HausDatabase,
    input: Pick<DesktopGateInput, 'agentId' | 'computerId' | 'serverId'>
) {
    const [row] = await db
        .select({
            agentName: agentsTable.displayName,
            attacherHandle: serverMembershipsTable.handle,
            changedAt: computersTable.computerUseChangedAt,
            enabled: computersTable.computerUseEnabled,
            inventory: computersTable.reportedInventory,
            listedAgentId: computerUseAgentsTable.agentId,
            operatingSystem: computersTable.operatingSystem,
            scope: computersTable.computerUseScope,
            slug: serversTable.slug,
        })
        .from(computersTable)
        .innerJoin(serversTable, eq(serversTable.id, computersTable.serverId))
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, computersTable.serverId),
                eq(agentsTable.id, input.agentId)
            )
        )
        .leftJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, computersTable.serverId),
                eq(serverMembershipsTable.userId, computersTable.attachedByUserId)
            )
        )
        .leftJoin(
            computerUseAgentsTable,
            and(
                eq(computerUseAgentsTable.computerId, computersTable.id),
                eq(computerUseAgentsTable.agentId, input.agentId)
            )
        )
        .where(
            and(
                eq(computersTable.serverId, input.serverId),
                eq(computersTable.id, input.computerId)
            )
        )
        .limit(1);
    if (!row) {
        return null;
    }
    return {
        agentName: row.agentName,
        attacherHandle: row.attacherHandle,
        changedAt: row.changedAt,
        enabled: row.enabled,
        listed: row.listedAgentId !== null,
        name: row.inventory?.name ?? 'this Device',
        operatingSystem: row.operatingSystem,
        readiness: row.inventory?.computerUse,
        scope: row.scope,
        slug: row.slug,
    };
}

export async function readDesktopDeviceName(
    db: HausDatabase,
    record: { computerId: string | null; serverId: string }
) {
    const [row] = record.computerId
        ? await db
              .select({ inventory: computersTable.reportedInventory })
              .from(computersTable)
              .where(
                  and(
                      eq(computersTable.serverId, record.serverId),
                      eq(computersTable.id, record.computerId)
                  )
              )
              .limit(1)
        : [];
    return row?.inventory?.name ?? 'this Device';
}

export async function desktopRefusalFacts(
    db: HausDatabase,
    input: DesktopGateInput,
    device: DesktopDevice,
    cause: DesktopRefusal
) {
    const facts: DesktopRefusalFacts = {
        agentName: device.agentName,
        attacherHandle: device.attacherHandle,
        cause,
        changedAt: device.changedAt,
        device: device.name,
        history: await readRefusalHistory(db, input, cause),
        link: new URL(
            `/s/${device.slug}/settings/computers/${input.computerId}`,
            input.appOrigin
        ).toString(),
        readiness: {
            macosVersion: device.readiness?.macosVersion,
            missing: readinessGaps(device.readiness),
        },
    };
    return facts;
}

async function readRefusalHistory(
    db: HausDatabase,
    input: DesktopGateInput,
    cause: DesktopRefusal
) {
    const refusals = and(
        eq(agentInvocationsTable.agentId, input.agentId),
        eq(agentInvocationsTable.computerId, input.computerId),
        isNotNull(agentInvocationsTable.refusal),
        ne(agentInvocationsTable.id, input.invocationId)
    );
    const [sameCause] = await db
        .select({ requestedAt: agentInvocationsTable.requestedAt })
        .from(agentInvocationsTable)
        .where(and(refusals, eq(agentInvocationsTable.refusal, cause)))
        .orderBy(desc(agentInvocationsTable.requestedAt))
        .limit(1);
    const [thisTurn] = await db
        .select({ id: agentInvocationsTable.id })
        .from(agentInvocationsTable)
        .where(and(refusals, eq(agentInvocationsTable.runId, input.runId)))
        .limit(1);
    return {
        lastRefusedAt: sameCause?.requestedAt ?? null,
        refusedThisTurn: thisTurn !== undefined,
    };
}

function readinessGaps(readiness: ComputerUseReadiness | undefined) {
    const gaps: DesktopReadinessGap[] = [];
    if (!readiness) {
        return gaps;
    }
    if (!readiness.installed) {
        gaps.push('install');
        return gaps;
    }
    if (readiness.accessibility === 'denied') {
        gaps.push('accessibility');
    }
    if (readiness.screenRecording === 'denied') {
        gaps.push('screen-recording');
    }
    return gaps;
}

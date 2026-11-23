import type { ComputerUseReadiness, DesktopRefusal } from '@haus/api';
import { and, desc, eq, isNotNull, lt, or } from 'drizzle-orm';
import { computerLabel, computerSettingsLink } from '../computer-access/computer-facts.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentInvocationsTable,
    agentsTable,
    computersTable,
    serverMembershipsTable,
    serversTable,
} from '../postgres/schema.ts';
import type { DesktopReadinessGap, DesktopRefusalFacts } from './desktop-refusal-text.ts';

export interface DesktopRefusalSubject {
    agentId: string;
    computerId: string;
    id: string;
    requestedAt: Date;
    runId: string;
    serverId: string;
}

export function desktopGateCause(device: DesktopDevice, online: boolean) {
    if (!device.enabled) {
        return 'off' as const;
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
    input: { agentId: string; computerId: string; serverId: string }
) {
    const [row] = await db
        .select({
            agentName: agentsTable.displayName,
            attacherHandle: serverMembershipsTable.handle,
            changedAt: computersTable.computerUseChangedAt,
            enabled: computersTable.computerUseEnabled,
            inventory: computersTable.reportedInventory,
            operatingSystem: computersTable.operatingSystem,
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
        name: computerLabel({ id: input.computerId, name: row.inventory?.name }),
        operatingSystem: row.operatingSystem,
        readiness: row.inventory?.computerUse,
        slug: row.slug,
    };
}

export async function readDesktopDeviceName(
    db: HausDatabase,
    record: { computerId: string | null; serverId: string }
) {
    const { computerId } = record;
    if (!computerId) {
        return 'that Computer';
    }
    const [row] = await db
        .select({ inventory: computersTable.reportedInventory })
        .from(computersTable)
        .where(and(eq(computersTable.serverId, record.serverId), eq(computersTable.id, computerId)))
        .limit(1);
    return computerLabel({ id: computerId, name: row?.inventory?.name });
}

export async function desktopRefusalFacts(
    db: HausDatabase,
    input: { appOrigin: string; cause: DesktopRefusal; device: DesktopDevice },
    subject: DesktopRefusalSubject
) {
    const { device } = input;
    const facts: DesktopRefusalFacts = {
        agentName: device.agentName,
        attacherHandle: device.attacherHandle,
        cause: input.cause,
        changedAt: device.changedAt,
        device: device.name,
        history: await readRefusalHistory(db, subject, input.cause),
        link: computerSettingsLink(input.appOrigin, {
            id: subject.computerId,
            slug: device.slug,
        }),
        readiness: {
            macosVersion: device.readiness?.macosVersion,
            missing: readinessGaps(device.readiness),
        },
    };
    return facts;
}

async function readRefusalHistory(
    db: HausDatabase,
    subject: DesktopRefusalSubject,
    cause: DesktopRefusal
) {
    const earlier = and(
        eq(agentInvocationsTable.agentId, subject.agentId),
        eq(agentInvocationsTable.computerId, subject.computerId),
        isNotNull(agentInvocationsTable.refusal),
        or(
            lt(agentInvocationsTable.requestedAt, subject.requestedAt),
            and(
                eq(agentInvocationsTable.requestedAt, subject.requestedAt),
                lt(agentInvocationsTable.id, subject.id)
            )
        )
    );
    const [sameCause] = await db
        .select({ requestedAt: agentInvocationsTable.requestedAt })
        .from(agentInvocationsTable)
        .where(and(earlier, eq(agentInvocationsTable.refusal, cause)))
        .orderBy(desc(agentInvocationsTable.requestedAt))
        .limit(1);
    const [thisTurn] = await db
        .select({ id: agentInvocationsTable.id })
        .from(agentInvocationsTable)
        .where(and(earlier, eq(agentInvocationsTable.runId, subject.runId)))
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

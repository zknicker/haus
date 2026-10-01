import {
    type ComputerUpdateProgress,
    computerProtocolVersion,
    type SignedComputerRelease,
    signedComputerReleaseSchema,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import type { ComputerConnections } from './connections.ts';
import { ComputerSetupDeniedError } from './service.ts';

const unreachableComputerMessage =
    'Reconnect this Computer before checking for or installing updates.';

export const productionComputerManifestUrl = 'https://releases.haus.chat/computer/latest.json';

export async function checkComputerUpdate(input: {
    computerId: string;
    connections: ComputerConnections;
    db: HausDatabase;
    manifestUrl: string;
    member: HausUser | null;
    serverId: string;
}) {
    const computer = await requireComputerAdmin(input);
    requireConnectedComputer(computer, input.connections);
    await setChecking(input.db, computer.id);
    try {
        const release = await fetchProductionRelease(input.manifestUrl);
        assertCompatibleProductionRelease(release);
        const available = isNewer(release.release.version, computer.productVersion);
        await input.db
            .update(computersTable)
            .set({
                updateDetail: available
                    ? `Haus Computer ${release.release.version} is available.`
                    : currentVersionDetail(release.release.version),
                updatePhase: available ? 'available' : 'idle',
                updateTargetVersion: release.release.version,
                updateUpdatedAt: new Date(),
            })
            .where(eq(computersTable.id, computer.id));
        return { available, version: release.release.version };
    } catch (cause) {
        await recordFailure(input.db, computer.id, cause, 'checking');
        throw cause;
    }
}

export async function startComputerUpdate(input: {
    computerId: string;
    connections: ComputerConnections;
    db: HausDatabase;
    manifestUrl: string;
    member: HausUser | null;
    targetVersion?: string;
    serverId: string;
}) {
    const computer = await requireComputerAdmin(input);
    requireConnectedComputer(computer, input.connections);
    // A socket can look attached until the heartbeat timeout; verify it answers now.
    if (!(await input.connections.probe(computer.id))) {
        throw new ComputerSetupDeniedError(unreachableComputerMessage);
    }
    await setChecking(input.db, computer.id);
    let failedPhase: ComputerUpdateProgress['failedPhase'] = 'checking';
    try {
        const release = await fetchProductionRelease(
            releaseManifestUrl(input.manifestUrl, input.targetVersion)
        );
        assertCompatibleProductionRelease(release);
        if (input.targetVersion && release.release.version !== input.targetVersion) {
            throw new Error(
                `Haus Computer release ${release.release.version} does not match selected target ${input.targetVersion}.`
            );
        }
        if (!isNewer(release.release.version, computer.productVersion)) {
            await input.db
                .update(computersTable)
                .set({
                    updateDetail: currentVersionDetail(release.release.version),
                    updatePhase: 'idle',
                    updateTargetVersion: release.release.version,
                    updateUpdatedAt: new Date(),
                })
                .where(eq(computersTable.id, computer.id));
            return { started: false, version: release.release.version };
        }
        await input.db
            .update(computersTable)
            .set({
                updateActiveAgentCount: null,
                updateDetail: 'Download requested.',
                updateDownloadedBytes: null,
                updateFailedPhase: null,
                updatePhase: 'requested',
                updateTargetVersion: release.release.version,
                updateTotalBytes: null,
                updateUpdatedAt: new Date(),
            })
            .where(eq(computersTable.id, computer.id));
        failedPhase = 'requested';
        if (!input.connections.sendUpdate(computer.id, release)) {
            throw new ComputerSetupDeniedError('This Computer is offline.');
        }
        return { started: true, version: release.release.version };
    } catch (cause) {
        await recordFailure(input.db, computer.id, cause, failedPhase);
        throw cause;
    }
}

export function releaseManifestUrl(latestManifestUrl: string, releaseVersion?: string) {
    if (!releaseVersion) {
        return latestManifestUrl;
    }
    const latest = new URL(latestManifestUrl);
    latest.pathname = latest.pathname.replace(
        /\/latest\.json$/u,
        `/${releaseVersion}/release.json`
    );
    return latest.toString();
}

async function requireComputerAdmin(input: {
    computerId: string;
    db: HausDatabase;
    member: HausUser | null;
    serverId: string;
}) {
    const membership = await requireServerMembership(input.db, input.member, input.serverId);
    if (membership.role !== 'owner' && membership.role !== 'admin') {
        throw new ComputerSetupDeniedError('Only a Server Owner or Admin can update a Computer.');
    }
    const [computer] = await input.db
        .select({
            health: computersTable.health,
            id: computersTable.id,
            productVersion: computersTable.productVersion,
        })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.id, input.computerId),
                eq(computersTable.serverId, input.serverId)
            )
        )
        .limit(1);
    if (!computer) {
        throw new ComputerSetupDeniedError('That Computer is not attached to this Server.');
    }
    return computer;
}

function requireConnectedComputer(
    computer: { health: string; id: string },
    connections: ComputerConnections
) {
    if (computer.health === 'offline' || !connections.hasAttachment(computer.id)) {
        throw new ComputerSetupDeniedError(unreachableComputerMessage);
    }
}

async function fetchProductionRelease(manifestUrl: string): Promise<SignedComputerRelease> {
    const response = await fetch(manifestUrl);
    if (!response.ok) {
        throw new Error(`Production Computer release check failed (${response.status}).`);
    }
    return signedComputerReleaseSchema.parse(await response.json());
}

async function setChecking(db: HausDatabase, computerId: string) {
    await db
        .update(computersTable)
        .set({
            updateDetail: 'Checking the production release.',
            updatePhase: 'checking',
            updateUpdatedAt: new Date(),
        })
        .where(eq(computersTable.id, computerId));
}

async function recordFailure(
    db: HausDatabase,
    computerId: string,
    cause: unknown,
    failedPhase: ComputerUpdateProgress['failedPhase']
) {
    await db
        .update(computersTable)
        .set({
            updateDetail: cause instanceof Error ? cause.message : 'Computer update failed.',
            updateFailedPhase: failedPhase,
            updatePhase: 'failed',
            updateUpdatedAt: new Date(),
        })
        .where(eq(computersTable.id, computerId));
}

function isNewer(candidate: string, installed: string | null): boolean {
    if (!installed) {
        return true;
    }
    const candidateParts = parseVersion(candidate);
    const installedParts = parseVersion(installed);
    for (let index = 0; index < 3; index += 1) {
        if (candidateParts[index] !== installedParts[index]) {
            return (candidateParts[index] ?? 0) > (installedParts[index] ?? 0);
        }
    }
    return false;
}

function currentVersionDetail(version: string): string {
    return `Haus Computer ${version} is the latest version.`;
}

function parseVersion(version: string): number[] {
    const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(version);
    if (!match) {
        throw new Error(`Invalid Computer release version "${version}".`);
    }
    return match.slice(1).map(Number);
}

function assertCompatibleProductionRelease(release: SignedComputerRelease) {
    if (release.release.protocolVersion !== computerProtocolVersion) {
        throw new Error(
            `Production Haus Computer ${release.release.version} does not satisfy protocol ${computerProtocolVersion}.`
        );
    }
}

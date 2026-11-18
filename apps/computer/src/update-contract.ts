import { computerHeartbeatAckSchema, computerHeartbeatConfigurationSchema } from '@haus/api';

export { computerBootstrapProtocolVersion, computerProtocolVersion } from '@haus/api';

export type ComputerUpdatePhase =
    | 'available'
    | 'checking'
    | 'complete'
    | 'downloading'
    | 'failed'
    | 'idle'
    | 'installing'
    | 'requested'
    | 'restarting'
    | 'verifying'
    | 'waiting-for-agents';

export interface ComputerUpdateProgress {
    activeAgentCount: number | null;
    detail: string | null;
    downloadedBytes: number | null;
    failedPhase: Exclude<ComputerUpdatePhase, 'failed'> | null;
    phase: ComputerUpdatePhase;
    targetVersion: string | null;
    totalBytes: number | null;
    updatedAt: string;
}

export interface SignedComputerRelease {
    release: {
        artifactUrl: string;
        protocolVersion: number;
        sha256: string;
        sourceRevision: string;
        version: string;
    };
    signature: string;
}

export function parseSignedComputerRelease(value: unknown): SignedComputerRelease {
    if (!(isRecord(value) && hasOnlyKeys(value, ['release', 'signature']))) {
        throw new Error('Production release manifest is invalid.');
    }
    const { release, signature } = value;
    if (
        !(
            isRecord(release) &&
            hasOnlyKeys(release, [
                'artifactUrl',
                'protocolVersion',
                'sha256',
                'sourceRevision',
                'version',
            ]) &&
            typeof release.artifactUrl === 'string' &&
            isUrl(release.artifactUrl) &&
            Number.isSafeInteger(release.protocolVersion) &&
            (release.protocolVersion as number) > 0 &&
            typeof release.sha256 === 'string' &&
            /^[a-f0-9]{64}$/u.test(release.sha256) &&
            typeof release.sourceRevision === 'string' &&
            /^[a-f0-9]{40}$/u.test(release.sourceRevision) &&
            typeof release.version === 'string' &&
            /^\d+\.\d+\.\d+$/u.test(release.version) &&
            typeof signature === 'string' &&
            /^(?:[A-Za-z0-9+/]{4}){21}[A-Za-z0-9+/]{2}==$/u.test(signature)
        )
    ) {
        throw new Error('Production release manifest is invalid.');
    }
    return {
        release: {
            artifactUrl: release.artifactUrl,
            protocolVersion: release.protocolVersion as number,
            sha256: release.sha256,
            sourceRevision: release.sourceRevision,
            version: release.version,
        },
        signature,
    };
}

export function parseBootstrapAccepted(value: unknown) {
    if (
        !(
            isRecord(value) &&
            hasOnlyKeys(value, ['mode', 'type']) &&
            value.type === 'bootstrap-accepted' &&
            (value.mode === 'ordinary' || value.mode === 'update-required')
        )
    ) {
        return null;
    }
    return { mode: value.mode, type: value.type };
}

export function parseComputerHeartbeatConfiguration(value: unknown) {
    const parsed = computerHeartbeatConfigurationSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

export function parseComputerHeartbeatAck(value: unknown) {
    const parsed = computerHeartbeatAckSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

export function parseComputerUpdateCommand(value: unknown) {
    if (!(isRecord(value) && hasOnlyKeys(value, ['release', 'type']) && value.type === 'update')) {
        return null;
    }
    try {
        return { release: parseSignedComputerRelease(value.release), type: value.type };
    } catch {
        return null;
    }
}

export function computerReleaseSigningPayload(release: SignedComputerRelease['release']): string {
    return JSON.stringify({
        artifactUrl: release.artifactUrl,
        protocolVersion: release.protocolVersion,
        sha256: release.sha256,
        sourceRevision: release.sourceRevision,
        version: release.version,
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, expected: string[]) {
    const keys = Object.keys(value);
    return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function isUrl(value: string) {
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
}

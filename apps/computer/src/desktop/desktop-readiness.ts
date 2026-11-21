import type { ComputerUsePermissionState, ComputerUseReadiness } from '@haus/api';
import { runtimeSearchPath } from '../runtime-discovery.ts';

const probeTimeoutMs = 10_000;

export async function detectComputerUseReadiness(
    options: { platform?: NodeJS.Platform; searchPath?: string } = {}
) {
    if ((options.platform ?? process.platform) !== 'darwin') {
        return;
    }
    const executable = Bun.which('agent-desktop', {
        PATH: options.searchPath ?? runtimeSearchPath(),
    });
    if (!executable) {
        return readiness({ installed: false });
    }
    const [version, permissions] = await Promise.all([
        probe(executable, 'version'),
        probe(executable, 'permissions'),
    ]);
    return readiness({
        installed: true,
        ...readPermissions(permissions),
        version: readVersion(version),
    });
}

export function readPermissions(envelope: unknown) {
    const data = dataOf(envelope);
    return {
        accessibility: permissionState(data?.accessibility),
        screenRecording: permissionState(data?.screen_recording ?? data?.screenRecording),
    };
}

export function readVersion(envelope: unknown) {
    const version = dataOf(envelope)?.version;
    return typeof version === 'string' && version.trim().length > 0
        ? version.trim().slice(0, 64)
        : null;
}

function readiness(input: Partial<ComputerUseReadiness> & { installed: boolean }) {
    return {
        accessibility: input.accessibility ?? 'unknown',
        installed: input.installed,
        screenRecording: input.screenRecording ?? 'unknown',
        version: input.version ?? null,
    } satisfies ComputerUseReadiness;
}

function permissionState(value: unknown) {
    const state = isRecord(value) ? value.state : value;
    const states: Record<string, ComputerUsePermissionState> = {
        authorized: 'granted',
        denied: 'denied',
        granted: 'granted',
        not_granted: 'denied',
        restricted: 'denied',
    };
    return (typeof state === 'string' ? states[state.toLowerCase()] : undefined) ?? 'unknown';
}

function dataOf(envelope: unknown) {
    return isRecord(envelope) && isRecord(envelope.data) ? envelope.data : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function probe(executable: string, command: string) {
    const child = Bun.spawn([executable, command], {
        stderr: 'ignore',
        stdout: 'pipe',
        timeout: probeTimeoutMs,
    });
    try {
        const [text] = await Promise.all([new Response(child.stdout).text(), child.exited]);
        return JSON.parse(text) as unknown;
    } catch {
        return;
    }
}

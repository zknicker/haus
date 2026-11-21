import type { ComputerUsePermissionState, ComputerUseReadiness } from '@haus/api';
import {
    type AgentDesktopInstall,
    agentDesktopToolsRoot,
    agentDesktopVersion,
    installAgentDesktop,
} from './agent-desktop-binary.ts';
import { clearPermissionsMoved, permissionsMoved } from './permission-holder.ts';

const probeTimeoutMs = 10_000;

export async function detectComputerUseReadiness(options: {
    dataRoot: string;
    platform?: NodeJS.Platform;
}) {
    if ((options.platform ?? process.platform) !== 'darwin') {
        return;
    }
    const install = await installAgentDesktop(agentDesktopToolsRoot(options.dataRoot)).catch(
        (error: unknown) => {
            console.error('[haus-computer] agent-desktop install failed', error);
            return null;
        }
    );
    if (!install) {
        return readiness({ installed: false });
    }
    const permissions = readPermissions(await probe(install, 'permissions'));
    const moved = await permissionsMoved(options.dataRoot);
    const granted =
        permissions.accessibility === 'granted' && permissions.screenRecording === 'granted';
    if (moved && granted) {
        await clearPermissionsMoved(options.dataRoot);
    }
    return readiness({
        installed: true,
        ...permissions,
        ...(moved && !granted ? { permissionsMoved: true } : {}),
        version: agentDesktopVersion,
    });
}

export function readPermissions(envelope: unknown) {
    const data = dataOf(envelope);
    return {
        accessibility: permissionState(data?.accessibility),
        screenRecording: permissionState(data?.screen_recording ?? data?.screenRecording),
    };
}

function readiness(input: Partial<ComputerUseReadiness> & { installed: boolean }) {
    return {
        accessibility: input.accessibility ?? 'unknown',
        installed: input.installed,
        ...(input.permissionsMoved ? { permissionsMoved: true } : {}),
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

async function probe(install: AgentDesktopInstall, command: string) {
    const child = Bun.spawn([install.executable, command], {
        env: { ...process.env, AGENT_DESKTOP_MACOS_HELPER_PATH: install.helper },
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

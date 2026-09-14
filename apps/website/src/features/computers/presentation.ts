import type { Agent, ComputerInventory } from '@haus/api';
import { computerRuntimeCatalog } from '@haus/api/computer-runtime';
import { AppleIcon, ComputerIcon, WindowsNewIcon } from '@hugeicons-pro/core-solid-rounded';

export interface ComputerPresentation {
    architecture: string | null;
    id: string;
    name: string | null;
    operatingSystem: string | null;
}

export type ComputerRuntimePresentation = ComputerInventory['runtimes'][number] & {
    detected: boolean;
};

export function computerLabel(computer: ComputerPresentation) {
    return (
        computer.name?.trim() ||
        `${operatingSystemLabel(computer.operatingSystem) ?? ''} Computer`.trim()
    );
}

export function computerSystemLabel(computer: ComputerPresentation) {
    return (
        [operatingSystemLabel(computer.operatingSystem), architectureLabel(computer.architecture)]
            .filter(Boolean)
            .join(' · ') || 'Awaiting first report'
    );
}

/**
 * The platform's own mark, for the chip that carries `computerSystemLabel`.
 *
 * Solid, not stroke: these are logos standing in for a manufacturer, and an
 * outlined Apple at 14px reads as a piece of fruit rather than as a brand. The
 * set has no penguin, so Linux and anything we have not seen before share the
 * generic machine glyph — a wrong-looking logo would say more than no logo.
 */
export function computerPlatformIcon(computer: Pick<ComputerPresentation, 'operatingSystem'>) {
    switch (computer.operatingSystem?.toLowerCase()) {
        case 'darwin':
            return AppleIcon;
        case 'win32':
        case 'windows':
            return WindowsNewIcon;
        default:
            return ComputerIcon;
    }
}

export function agentExecutionLabels(
    agent: Pick<Agent, 'desiredModelId' | 'desiredRuntimeId'>,
    inventory: ComputerInventory | null
) {
    const runtime = inventory?.runtimes?.find(
        (candidate) => candidate.id === agent.desiredRuntimeId
    );
    const model = runtime?.models.find((candidate) => candidate.id === agent.desiredModelId);
    return {
        model: model?.label ?? agent.desiredModelId,
        modelAvailable: Boolean(model),
        runtime: runtime?.label ?? agent.desiredRuntimeId,
        runtimeAvailable: Boolean(runtime),
    };
}

export function computerRuntimePresentations(
    inventory: ComputerInventory | null
): ComputerRuntimePresentation[] {
    const detectedRuntimes = new Map(
        inventory?.runtimes?.map((runtime) => [runtime.id, runtime] as const) ?? []
    );
    const supportedRuntimes = computerRuntimeCatalog.map((runtime) => {
        const detectedRuntime = detectedRuntimes.get(runtime.id);
        detectedRuntimes.delete(runtime.id);
        return {
            ...(detectedRuntime ?? runtime),
            detected: Boolean(detectedRuntime),
            models: detectedRuntime?.models ?? [],
        };
    });

    return [
        ...supportedRuntimes,
        ...Array.from(detectedRuntimes.values(), (runtime) => ({
            ...runtime,
            detected: true,
        })),
    ];
}

export function availabilityLabel(value: Agent['availability']) {
    switch (value) {
        case 'idle':
            return 'Online';
        case 'working':
            return 'Working';
        case 'error':
            return 'Needs attention';
        case 'stopped':
            return 'Stopped';
        case 'offline':
            return 'Offline';
    }
}

export function computerHealthLabel(
    health: 'degraded' | 'healthy' | 'offline' | 'update-required'
) {
    switch (health) {
        case 'healthy':
            return 'Online';
        case 'offline':
            return 'Offline';
        case 'update-required':
            return 'Update required';
        case 'degraded':
            return 'Needs attention';
    }
}

export function computerHealthColor(
    health: 'degraded' | 'healthy' | 'offline' | 'update-required'
) {
    return health === 'healthy'
        ? ('success' as const)
        : health === 'offline'
          ? ('default' as const)
          : ('warning' as const);
}

function operatingSystemLabel(value: string | null) {
    switch (value?.toLowerCase()) {
        case 'darwin':
            return 'Mac';
        case 'linux':
            return 'Linux';
        case 'win32':
        case 'windows':
            return 'Windows';
        default:
            return value;
    }
}

function architectureLabel(value: string | null) {
    switch (value?.toLowerCase()) {
        case 'arm64':
            return 'Apple Silicon';
        case 'x64':
        case 'x86_64':
            return 'Intel';
        default:
            return value;
    }
}

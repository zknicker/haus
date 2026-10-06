import type {
    ComputerUpdateStep,
    DesktopUpdateStep,
    HausUpdateStep,
    HausUpdateView,
} from './haus-update-model.ts';
import type { HausUpdateOperations } from './haus-update-reconciler.ts';

export function operations(
    readView: () => HausUpdateView,
    overrides: Partial<HausUpdateOperations>
): HausUpdateOperations {
    return {
        downloadDesktop: async () => undefined,
        forgetPendingComputers: () => undefined,
        readView,
        rememberPendingComputers: () => undefined,
        restartDesktop: async () => undefined,
        updateComputer: async () => undefined,
        waitForChange: async () => undefined,
        ...overrides,
    };
}

export function computer(
    id: string,
    phase: ComputerUpdateStep['phase'],
    detail: string | null = null,
    connected = true
): ComputerUpdateStep {
    return {
        connected,
        currentVersion: phase === 'current' ? '1.4.9' : '1.4.8',
        detail,
        failedPhase: phase === 'failed' ? 'verifying' : null,
        id,
        kind: 'computer',
        label: id,
        phase,
        progress: null,
        targetVersion: '1.4.9',
    };
}

export function desktop(phase: DesktopUpdateStep['phase']): DesktopUpdateStep {
    return {
        currentVersion: phase === 'current' ? '1.8.40' : '1.8.39',
        detail: null,
        id: 'desktop-app',
        kind: 'desktop-app',
        label: 'Haus App',
        phase,
        progress: null,
        targetVersion: '1.8.40',
    };
}

export function replaceStep(current: HausUpdateView, step: HausUpdateStep) {
    return view(current.steps.map((candidate) => (candidate.id === step.id ? step : candidate)));
}

export function view(steps: HausUpdateStep[]): HausUpdateView {
    return {
        componentFacts: [],
        detail: '',
        headline: '',
        phase: steps.every((step) => step.phase === 'current') ? 'current' : 'available',
        primaryAction: null,
        steps,
        version: '1.9.0',
    };
}

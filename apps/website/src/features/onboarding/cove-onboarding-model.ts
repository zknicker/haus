import type { ServerDetail } from '../../lib/haus-server.tsx';

export type CoveOnboardingView =
    | 'app'
    | 'connect-computer'
    | 'connect-failed'
    | 'detecting-runtimes'
    | 'meet-cove'
    | 'applying-cove'
    | 'apply-failed';

/** Haus Computer ships Apple Silicon macOS only; Windows stays visible but unselectable. */
export const coveComputerPlatforms = [
    { id: 'macos', isAvailable: true, label: 'macOS (Apple Silicon)' },
    { id: 'windows', isAvailable: false, label: 'Windows' },
] as const;

export interface CoveStatusLine {
    label: string;
    tone: 'done' | 'failed' | 'waiting';
}

type ServerOnboarding = ServerDetail['onboarding'];

/** Server-owned progress is the only authority for entering the general App. */
export function getCoveOnboardingView(onboarding: ServerOnboarding): CoveOnboardingView {
    if (onboarding.phase === 'complete') {
        return 'app';
    }
    if (onboarding.phase === 'awaiting-cove') {
        return 'meet-cove';
    }
    if (onboarding.phase === 'applying') {
        return onboarding.failure ? 'apply-failed' : 'applying-cove';
    }
    if (onboarding.failure) {
        return 'connect-failed';
    }
    return onboarding.computerId ? 'detecting-runtimes' : 'connect-computer';
}

/**
 * Only the live handoff (this window just watched the gate finish) enters the onboarding
 * chat. Later visits, including App launch at the Server root, navigate normally.
 */
export function resolveCoveAppHandoff(input: {
    onboardingChatPath: string;
    pathname: string;
    pending: boolean;
}) {
    return {
        redirect:
            input.pending && input.pathname !== input.onboardingChatPath
                ? input.onboardingChatPath
                : null,
    };
}

export interface CoveRepairGuidance {
    /** Exact command to run on the Computer’s machine, when one repairs it. */
    command: string | null;
    /** Set when reconnection alone resumes setup with no App action. */
    note: string | null;
    remedy: string;
    title: string;
}

const reconnectResumesNote =
    'Setup continues automatically once the device reconnects — no need to press anything.';

/**
 * Human repair copy deliberately hides factory, seed, command, and
 * acknowledgement detail; each code maps to one precise operator action.
 */
export function getCoveRepairGuidance(
    failure: NonNullable<ServerOnboarding['failure']> | null
): CoveRepairGuidance {
    if (failure?.code === 'computer-disconnected') {
        return {
            command: 'haus-computer start',
            note: reconnectResumesNote,
            remedy: 'Start Haus Computer on the Mac it runs on.',
            title: 'This device is offline',
        };
    }
    if (failure?.code === 'computer-incompatible') {
        return {
            command: 'haus-computer upgrade',
            note: reconnectResumesNote,
            remedy: 'Update Haus Computer on the Mac it runs on.',
            title: 'Haus Computer needs an update',
        };
    }
    if (failure?.code === 'inventory-empty') {
        return {
            command: null,
            note: reconnectResumesNote,
            remedy: 'Sign in to Codex or Claude Code on that Mac, then restart Haus Computer.',
            title: 'No runtime is available on this device',
        };
    }
    if (failure?.code === 'inventory-invalid') {
        return {
            command: 'haus-computer upgrade',
            note: reconnectResumesNote,
            remedy: 'Update Haus Computer on the Mac it runs on.',
            title: 'This device needs an update before Cove can start',
        };
    }
    if (failure?.code === 'application-failed') {
        return {
            command: 'haus-computer logs',
            note: null,
            remedy: 'Press Try again. If it fails again, check the device’s local logs on that Mac.',
            title: 'Cove’s setup didn’t finish',
        };
    }
    return {
        command: null,
        note: null,
        remedy: 'Make sure this device is connected, then try again.',
        title: 'Cove needs another try',
    };
}

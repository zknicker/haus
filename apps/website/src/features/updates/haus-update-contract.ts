export type HausUpdatePhase =
    | 'available'
    | 'current'
    | 'failed'
    | 'restart-required'
    | 'reload-required'
    | 'updating';

export interface HausReleaseSnapshot {
    components: {
        agent: string | null;
        computer: string | null;
        desktopApp: string | null;
        ios: { buildNumber: number; version: string } | null;
        server: string | null;
    };
    sourceRevision: string;
    version: string;
}

export type HausUpdateComputerPhase =
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

export interface HausUpdateComputer {
    currentVersion: string | null;
    detail?: string | null;
    failedPhase?: string | null;
    health: 'degraded' | 'healthy' | 'offline' | 'update-required';
    id: string;
    lastConnectedAt: string | null;
    name: string;
    phase: HausUpdateComputerPhase;
    progress?: number | null;
    reportedTargetVersion?: string | null;
    updateUpdatedAt?: string | null;
}

export type HausUpdateDesktop =
    | { kind: 'web' }
    | {
          currentVersion: string | null;
          detail?: string | null;
          kind: 'desktop';
          phase:
              | 'available'
              | 'checking'
              | 'current'
              | 'downloading'
              | 'error'
              | 'idle'
              | 'ready'
              | 'restarting';
          progress?: number | null;
      };

export type HausUpdateStep = ComputerUpdateStep | DesktopUpdateStep;

export interface ComputerUpdateStep {
    currentVersion: string | null;
    detail: string | null;
    failedPhase: string | null;
    id: string;
    kind: 'computer';
    label: string;
    phase: HausUpdateComputerPhase | 'current';
    progress: number | null;
    targetVersion: string;
}

export interface DesktopUpdateStep {
    currentVersion: string | null;
    detail: string | null;
    id: 'desktop-app';
    kind: 'desktop-app';
    label: 'Haus App';
    phase:
        | 'available'
        | 'checking'
        | 'current'
        | 'downloading'
        | 'failed'
        | 'pending'
        | 'restart-required'
        | 'restarting';
    progress: number | null;
    targetVersion: string;
}

export interface HausComponentFact {
    currentVersion: string | null;
    detail: string | null;
    id: string;
    kind: 'computer' | 'desktop-app' | 'website';
    label: string;
    remedy: string | null;
    status: 'current' | 'external' | 'failed' | 'pending' | 'updating';
    targetVersion: string | null;
}

export interface HausUpdateView {
    componentFacts: HausComponentFact[];
    detail: string;
    headline: string;
    phase: HausUpdatePhase;
    primaryAction:
        | { kind: 'restart'; label: 'Restart' }
        | { kind: 'reload'; label: 'Reload' }
        | { kind: 'retry'; label: 'Try again' }
        | { kind: 'start'; label: 'Update' }
        | null;
    steps: HausUpdateStep[];
    version: string;
}

export interface HausUpdateInput {
    computers: readonly HausUpdateComputer[];
    desktop: HausUpdateDesktop;
    observedAt?: number;
    release: HausReleaseSnapshot;
}

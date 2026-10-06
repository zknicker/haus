import { Label, ProgressBar } from '@heroui/react';
import { computerUpdatePhaseLabel } from '../computers/computer-update-model.ts';
import type { HausUpdateStep } from './haus-update-model.ts';
import { isActiveUpdateStep } from './haus-update-model.ts';

export function HausUpdateProgress({ steps }: { steps: readonly HausUpdateStep[] }) {
    const activeSteps = steps.filter(isActiveUpdateStep);

    if (activeSteps.length === 0) {
        return null;
    }

    return (
        <div className="grid min-w-72 gap-3">
            {activeSteps.map((step) => (
                <div className="grid gap-1.5" key={step.id}>
                    <div className="flex items-baseline justify-between gap-8 text-sm">
                        <p className="min-w-0 truncate text-foreground">{step.label}</p>
                        <p className="whitespace-nowrap font-mono text-muted tabular-nums">
                            {step.currentVersion ?? 'Unknown'} → {step.targetVersion}
                        </p>
                    </div>
                    {step.progress === null ? (
                        <p className="text-muted text-sm">{updateStageLine(step)}</p>
                    ) : (
                        <UpdateProgressBar label={updateStepLabel(step)} progress={step.progress} />
                    )}
                </div>
            ))}
        </div>
    );
}

export function UpdateProgressBar({ label, progress }: { label: string; progress: number | null }) {
    const value = progress === null ? 0 : Math.min(1, Math.max(0, progress)) * 100;

    return (
        <ProgressBar
            aria-label={label}
            className="w-64 max-w-full"
            isIndeterminate={progress === null}
            size="sm"
            value={value}
        >
            <Label>{label}</Label>
            {progress === null ? null : <ProgressBar.Output />}
            <ProgressBar.Track>
                <ProgressBar.Fill />
            </ProgressBar.Track>
        </ProgressBar>
    );
}

function updateStepLabel(step: HausUpdateStep) {
    if (step.kind === 'computer') {
        if (step.phase === 'current') {
            return 'Up to date';
        }
        return computerUpdatePhaseLabel(step.phase);
    }

    switch (step.phase) {
        case 'checking':
            return 'Checking for a Haus App update…';
        case 'downloading':
            return 'Downloading Haus App';
        case 'restarting':
            return 'Restarting Haus App';
        default:
            return 'Updating Haus App';
    }
}

/** A plain stage line for a phase that reports no progress. */
export function updateStageLine(step: HausUpdateStep) {
    if (step.kind === 'desktop-app') {
        return updateStepLabel(step);
    }
    switch (step.phase) {
        case 'checking':
        case 'requested':
            return `Starting the update on ${step.name}`;
        case 'downloading':
            return `Downloading the update to ${step.name}`;
        case 'verifying':
            return `Verifying the update on ${step.name}`;
        case 'installing':
            return `Installing the update on ${step.name}`;
        case 'waiting-for-agents':
            return `Waiting for Agents to finish on ${step.name}`;
        case 'restarting':
            return `Restarting ${step.name}`;
        default:
            return computerUpdatePhaseLabel(step.phase === 'current' ? 'complete' : step.phase);
    }
}

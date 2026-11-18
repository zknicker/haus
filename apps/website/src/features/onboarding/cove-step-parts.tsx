import { Button, Spinner } from '@heroui/react';
import { AlertCircleIcon, CheckmarkCircle02Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { cn } from '../../lib/utils.ts';
import type { CoveStatusLine } from './cove-onboarding-model.ts';
import './cove-onboarding.css';

const setupStepLabels = ['Connect a Computer', 'Meet Cove', 'Onboarding Chat'];

export type CoveSetupStage = 'connect-computer' | 'meet-cove';

/** Every onboarding step keeps the same escape hatch. */
export function SwitchServerButton({ onPress }: { onPress: () => void }) {
    return (
        <Button onPress={onPress} variant="ghost">
            Switch Server
        </Button>
    );
}

/** Three plain rectangles — the only progress signal in the frame. */
export function SetupProgressMarker({ stage }: { stage: CoveSetupStage }) {
    const currentStep = stage === 'meet-cove' ? 1 : 0;

    return (
        <ol aria-label="Cove onboarding progress" className="cove-progress-marker">
            {setupStepLabels.map((label, index) => (
                <li aria-current={index === currentStep ? 'step' : undefined} key={label}>
                    <span
                        aria-hidden="true"
                        className={`cove-progress-marker__bar ${
                            index <= currentStep ? 'bg-accent' : 'bg-separator'
                        }`}
                    />
                    <span className="sr-only">
                        {label} ·{' '}
                        {index < currentStep
                            ? 'complete'
                            : index === currentStep
                              ? 'current'
                              : 'upcoming'}
                    </span>
                </li>
            ))}
        </ol>
    );
}

export function StatusLineList({ lines }: { lines: CoveStatusLine[] }) {
    if (lines.length === 0) {
        return null;
    }

    return (
        <ul className="grid gap-1.5">
            {lines.map((line) => (
                <li className="flex items-start gap-2 text-base sm:text-sm" key={line.label}>
                    <StatusLineIcon tone={line.tone} />
                    <span className={line.tone === 'waiting' ? 'text-muted' : undefined}>
                        {line.label}
                    </span>
                </li>
            ))}
        </ul>
    );
}

/**
 * A 16px mark sitting on the first line of a label that wraps on narrow
 * viewports, so it stays fixed-size and top-aligned rather than centering
 * against the whole block.
 */
function StatusLineIcon({ tone }: { tone: CoveStatusLine['tone'] }) {
    if (tone === 'waiting') {
        return <Spinner aria-hidden="true" className="mt-0.5 shrink-0" size="sm" />;
    }

    return (
        <Icon
            aria-hidden="true"
            className={cn('mt-0.5 shrink-0', tone === 'failed' ? 'text-danger' : 'text-success')}
            icon={tone === 'failed' ? AlertCircleIcon : CheckmarkCircle02Icon}
            size={16}
        />
    );
}

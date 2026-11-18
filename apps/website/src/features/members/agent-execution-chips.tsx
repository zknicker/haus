import { type AgentReasoningEffort, agentReasoningEffortLabels } from '@haus/api';
import { Chip } from '@heroui/react';
import { LowSignalIcon, MediumSignalIcon, SignalFull02Icon } from '@hugeicons/core-free-icons';
import type { HugeiconsIconProps } from '@hugeicons/react';
import { ModelProviderBadge } from '../../components/badges/model-provider-badge.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { getModelProviderConfig } from '../../lib/model-provider-config.ts';

export function AgentExecutionChips({
    modelLabel,
    reasoningEffort,
    runtimeId,
    runtimeLabel,
}: {
    modelLabel: string;
    reasoningEffort: AgentReasoningEffort;
    runtimeId: string;
    runtimeLabel: string;
}) {
    const runtimeProvider = getModelProviderConfig(runtimeId);
    const reasoningLabel = agentReasoningEffortLabels[reasoningEffort];
    const reasoning = reasoningPresentation[reasoningEffort];

    return (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
            <ModelProviderBadge
                aria-label={`Runtime: ${runtimeLabel}; model: ${modelLabel}`}
                className="max-w-full"
                color={runtimeProvider.color}
                icon={runtimeProvider.icon}
                label={`${runtimeLabel} · ${modelLabel}`}
                logo={runtimeProvider.logo}
                size="sm"
            />
            <Chip data-reasoning-effort={reasoningEffort} size="sm" variant="secondary">
                <Icon
                    className={`size-3.5 ${reasoning.colorClassName}`}
                    icon={reasoning.icon}
                    strokeWidth={2}
                />
                <Chip.Label className={reasoning.colorClassName}>{reasoningLabel}</Chip.Label>
            </Chip>
        </div>
    );
}

const reasoningPresentation = {
    default: { colorClassName: 'text-muted', icon: MediumSignalIcon },
    xhigh: { colorClassName: 'text-reasoning-high', icon: SignalFull02Icon },
    max: { colorClassName: 'text-reasoning-high', icon: SignalFull02Icon },
    high: {
        colorClassName: 'text-reasoning-high',
        icon: SignalFull02Icon,
    },
    low: {
        colorClassName: 'text-reasoning-low',
        icon: LowSignalIcon,
    },
    medium: {
        colorClassName: 'text-reasoning-medium',
        icon: MediumSignalIcon,
    },
} satisfies Record<
    AgentReasoningEffort,
    {
        colorClassName: string;
        icon: HugeiconsIconProps['icon'];
    }
>;

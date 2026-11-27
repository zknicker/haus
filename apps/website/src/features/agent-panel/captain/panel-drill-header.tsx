import { Button, Tooltip } from '@heroui/react';
import { ArrowLeft01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';

export function PanelDrillHeader({
    action,
    backLabel,
    children,
    onBack,
    wrap = false,
}: {
    action?: React.ReactNode;
    backLabel: string;
    children: React.ReactNode;
    onBack: () => void;
    wrap?: boolean;
}) {
    return (
        <div
            className={wrap ? 'flex min-w-0 items-start gap-1' : 'flex min-w-0 items-center gap-1'}
        >
            <Tooltip>
                <Button
                    aria-label={`Back to ${backLabel}`}
                    isIconOnly
                    onPress={onBack}
                    size="sm"
                    variant="ghost"
                >
                    <Icon aria-hidden="true" icon={ArrowLeft01Icon} size={16} />
                </Button>
                <Tooltip.Content>Back to {backLabel}</Tooltip.Content>
            </Tooltip>
            <h2
                className={
                    wrap
                        ? 'text-foreground min-w-0 flex-1 pt-1 font-semibold'
                        : 'text-foreground min-w-0 flex-1 truncate font-semibold'
                }
            >
                {children}
            </h2>
            {action}
        </div>
    );
}

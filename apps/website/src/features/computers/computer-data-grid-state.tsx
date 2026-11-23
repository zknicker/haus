import { Button } from '@heroui/react';
import { AlertCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import type { IconSvgElement } from '@hugeicons/react';
import { SettingsEmptyState } from '../settings/layout/settings-empty.tsx';

type ComputerDataGridStateProps =
    | { label: string; status: 'loading' }
    | { icon: IconSvgElement; label: string; status: 'empty' }
    | { label: string; onRetry: () => void; status: 'unavailable' };

export function ComputerDataGridState(props: ComputerDataGridStateProps) {
    if (props.status === 'loading') {
        return (
            <div aria-busy="true">
                <span className="sr-only">{props.label}</span>
            </div>
        );
    }
    if (props.status === 'unavailable') {
        return (
            <SettingsEmptyState
                action={
                    <Button onPress={props.onRetry} size="sm" variant="secondary">
                        Try again
                    </Button>
                }
                icon={AlertCircleIcon}
                role="status"
                title={props.label}
            />
        );
    }
    return <SettingsEmptyState icon={props.icon} role="status" title={props.label} />;
}

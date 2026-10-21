import { Button } from '@heroui/react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../../../components/ui/icon.tsx';
import { formatDayLabel } from '../../../members/agent-profile/agent-turn-row-model.ts';

/**
 * The lens's day bar: older and newer day, the day's label, then the page's
 * Agent filter at the end. Sticky, on the page ground.
 */
export function HeartbeatsDayBar({
    action,
    dayStartMs,
    nowMs,
    offset,
    onShowDay,
}: {
    action: React.ReactNode;
    dayStartMs: number;
    nowMs: number;
    offset: number;
    onShowDay: (offset: number) => void;
}) {
    return (
        <section
            aria-label="Heartbeats day"
            className="sticky top-0 z-10 -mt-px flex min-w-0 items-center gap-1 border-separator border-b bg-background px-(--trace-pad) pt-1 pb-1"
        >
            <Button
                aria-label="Show the earlier day"
                isIconOnly
                onPress={() => onShowDay(offset + 1)}
                size="sm"
                variant="ghost"
            >
                <Icon icon={ArrowLeft01Icon} size={16} />
            </Button>
            <Button
                aria-label={offset > 0 ? 'Show the later day' : 'No later days'}
                isDisabled={offset === 0}
                isIconOnly
                onPress={() => onShowDay(offset - 1)}
                size="sm"
                variant="ghost"
            >
                <Icon icon={ArrowRight01Icon} size={16} />
            </Button>
            <h3 aria-live="polite" className="ms-1 shrink-0 font-medium text-sm">
                {formatDayLabel(new Date(dayStartMs), nowMs)}
            </h3>
            <span className="ms-auto flex items-center gap-1">{action}</span>
        </section>
    );
}

import { Button } from '@heroui/react';
import { ArrowUpRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { cn } from '../../../lib/utils.ts';
import { traceRowClass } from '../../turn-trace/turn-trace-grid.tsx';
import { DreamSheet } from './dream-sheet.tsx';

const label = 'See memory changes';

/**
 * A settled dream turn's way to what it changed: the dream sheet the profile's
 * Dreams list opens. It sits where a Chat turn's Chat button does — a dream has
 * no Chat — laid over the header's grid at the end of the empty track column,
 * shown by pointer over the header or keyboard focus, and in a narrow log
 * keeping only its icon in the room at the end of the title.
 */
export function LogDreamButton({
    agentId,
    runId,
    serverId,
}: {
    agentId: string;
    runId: string;
    serverId: string;
}) {
    const [isOpen, setOpen] = React.useState(false);
    return (
        <>
            <div
                className={cn(
                    traceRowClass('default', 'log'),
                    'pointer-events-none absolute inset-0',
                    'opacity-0',
                    'focus-within:opacity-100 group-hover/turn-header:opacity-100',
                    'group-has-[[data-log-header]:focus-visible]/turn-header:opacity-100'
                )}
            >
                <div className="pointer-events-auto @max-2xl/activity-log:col-start-2 col-start-3 flex justify-self-end">
                    <Button
                        aria-label={label}
                        onPress={() => setOpen(true)}
                        size="sm"
                        variant="ghost"
                    >
                        <span className="@max-2xl/activity-log:sr-only truncate">{label}</span>
                        <Icon aria-hidden="true" icon={ArrowUpRight01Icon} size={16} />
                    </Button>
                </div>
            </div>
            <DreamSheet
                agentId={agentId}
                onOpenChange={setOpen}
                runId={isOpen ? runId : null}
                serverId={serverId}
            />
        </>
    );
}

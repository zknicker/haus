import { Disclosure } from '@heroui/react';
import { TextShimmer } from '@heroui-pro/react';
import type { IconSvgElement } from '@hugeicons/react';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { cn } from '../../lib/utils.ts';
import {
    TraceCells,
    type TraceCellsProps,
    traceRowClass,
    useTraceDepthStyle,
} from './turn-trace-grid.tsx';

/**
 * A row that only states what happened: one line on the trace grid, no
 * disclosure, no tab stop. Its disclosure slot stays reserved and empty.
 */
export function TraceRow(props: TraceCellsProps) {
    return (
        <div className={traceRowClass(props.tone)} data-trace-row style={useTraceDepthStyle()}>
            <TraceCells {...props} />
        </div>
    );
}

/**
 * A row that opens to its evidence: stock Disclosure, whose trigger is the
 * whole row and its one tab stop, with the stock chevron in the disclosure
 * slot. The stock panel animates its height both ways (off under reduced
 * motion). The body mounts on first open, so a long turn pays only for what
 * someone reads.
 */
export function TraceDisclosure({
    children,
    defaultExpanded = false,
    ...cells
}: Omit<TraceCellsProps, 'slot'> & {
    children: React.ReactNode;
    defaultExpanded?: boolean;
}) {
    const [expanded, setExpanded] = React.useState(defaultExpanded);
    const [opened, setOpened] = React.useState(defaultExpanded);

    return (
        <Disclosure
            isExpanded={expanded}
            onExpandedChange={(next) => {
                setExpanded(next);
                if (next) {
                    setOpened(true);
                }
            }}
        >
            <Disclosure.Heading>
                <Disclosure.Trigger
                    className={cn(
                        traceRowClass(cells.tone),
                        // A hovered row's bars ring in the hover fill, not the ground.
                        cells.tone !== 'danger' &&
                            'hover:bg-default hover:[--trace-ring:var(--default)]'
                    )}
                    data-trace-row
                    style={useTraceDepthStyle()}
                >
                    <TraceCells {...cells} slot={<Disclosure.Indicator />} />
                </Disclosure.Trigger>
            </Disclosure.Heading>
            <Disclosure.Content>{opened ? children : null}</Disclosure.Content>
        </Disclosure>
    );
}

/**
 * Icon, label, muted detail (the place it happened, or a script's first
 * line), and any trailing fact. On a narrow label column the meta gives way
 * first, then the detail; the label and an alert keep their width. A running label shimmers.
 */
export function TraceLine({
    alert,
    detail,
    icon,
    isQuiet = false,
    isRunning = false,
    label,
    meta,
    tone = 'muted',
}: {
    /** A count that must survive any width, in danger: `2 failed`. */
    alert?: string | null;
    detail?: string | null;
    icon: IconSvgElement;
    isQuiet?: boolean;
    isRunning?: boolean;
    label: string;
    meta?: React.ReactNode;
    tone?: 'danger' | 'muted' | 'warning';
}) {
    const text = (
        <span
            className={cn(
                'min-w-0 truncate',
                // Beside detail the label holds its width: flex shrinks by
                // width, so a long detail would otherwise clip a short label.
                detail && 'max-w-full shrink-0',
                !(isRunning || isQuiet) && 'text-foreground',
                isQuiet && !isRunning && 'text-muted'
            )}
        >
            {label}
        </span>
    );
    return (
        <>
            <Icon
                className={cn(
                    'size-3.5 shrink-0',
                    tone === 'danger' && 'text-danger',
                    tone === 'warning' && 'text-warning',
                    tone === 'muted' && 'text-muted'
                )}
                icon={icon}
            />
            {isRunning ? <TextShimmer className="min-w-0 truncate">{text}</TextShimmer> : text}
            {detail ? (
                <span className="min-w-0 shrink-[4] truncate text-muted">{detail}</span>
            ) : null}
            {meta ? (
                <span className="min-w-0 shrink-[8] truncate text-muted tabular-nums">{meta}</span>
            ) : null}
            {alert ? <span className="shrink-0 text-danger tabular-nums">{alert}</span> : null}
        </>
    );
}

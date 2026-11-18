import { TextShimmer } from '@heroui-pro/react';
import { useReducedMotion } from 'framer-motion';
import * as React from 'react';
import { SlotText } from 'slot-text/react';
import { cn } from '../../lib/utils.ts';

const activeHeaderDwellMs = 280;
const slotTextPrimeAttemptLimit = 10;
const slotTextHeaderLimit = 64;

export function WorkGroupHeaderText({
    isActive,
    label,
}: {
    isActive: boolean;
    label: string | null;
}) {
    const shouldReduceMotion = useReducedMotion();
    const slotTextRef = React.useRef<HTMLSpanElement | null>(null);
    const [slotReady, setSlotReady] = React.useState(false);
    const canSlot =
        isActive &&
        shouldReduceMotion === false &&
        label !== null &&
        label.length <= slotTextHeaderLimit;

    React.useEffect(() => {
        if (!canSlot) {
            setSlotReady(false);
            return;
        }

        let cancelled = false;
        let revealFrame: number | null = null;
        let revealTimeout: number | null = null;
        const reveal = (attempt = 0) => {
            if (cancelled) {
                return;
            }

            if (!isSlotTextPrimed(slotTextRef.current)) {
                if (attempt < slotTextPrimeAttemptLimit) {
                    revealTimeout = window.setTimeout(() => reveal(attempt + 1), 32);
                }

                return;
            }

            if (!cancelled) {
                setSlotReady(true);
            }
        };

        setSlotReady(false);

        if (typeof window.requestAnimationFrame === 'function') {
            const primeFrame = window.requestAnimationFrame(() => {
                revealFrame = window.requestAnimationFrame(reveal);
            });

            return () => {
                cancelled = true;
                window.cancelAnimationFrame(primeFrame);

                if (revealFrame !== null) {
                    window.cancelAnimationFrame(revealFrame);
                }

                if (revealTimeout !== null) {
                    window.clearTimeout(revealTimeout);
                }
            };
        }

        const timeout = window.setTimeout(reveal, 32);

        return () => {
            cancelled = true;
            window.clearTimeout(timeout);

            if (revealTimeout !== null) {
                window.clearTimeout(revealTimeout);
            }
        };
    }, [canSlot]);

    return (
        <WorkGroupHeaderTextView
            canSlot={canSlot}
            isActive={isActive}
            label={label}
            slotReady={slotReady}
            slotRef={slotTextRef}
        />
    );
}

export function WorkGroupHeaderTextView({
    canSlot,
    isActive,
    label,
    slotRef,
    slotReady,
}: {
    canSlot: boolean;
    isActive: boolean;
    label: string | null;
    slotRef?: React.Ref<HTMLSpanElement>;
    slotReady: boolean;
}) {
    if (!label) {
        return null;
    }

    const className = 'min-w-0 max-w-[28rem] truncate text-left';

    if (!canSlot) {
        // Stock Pro shimmer for the active label; SlotText owns the animation
        // in the other branch, so the two never stack.
        return isActive ? (
            <TextShimmer className={className}>{label}</TextShimmer>
        ) : (
            <span className={className}>{label}</span>
        );
    }

    return (
        <span className={className}>
            <span className={slotReady ? 'sr-only' : undefined}>{label}</span>
            <SlotText
                aria-hidden={true}
                className={cn('slot-text', slotReady ? 'inline-flex' : 'sr-only')}
                options={slotTextOptions}
                ref={slotRef}
                text={label}
            />
        </span>
    );
}

function isSlotTextPrimed(element: HTMLSpanElement | null) {
    return Boolean(element?.querySelector('.char-slot'));
}

const slotTextOptions = {
    bounce: 0.28,
    direction: 'up',
    duration: 220,
    interrupt: true,
    skipUnchanged: true,
    stagger: 12,
} as const;

export function useStableWorkGroupLabel(label: string | null, enabled: boolean) {
    const [stableLabel, setStableLabel] = React.useState(label);
    const stableLabelRef = React.useRef(label);
    const latestLabelRef = React.useRef(label);

    React.useEffect(() => {
        latestLabelRef.current = label;
    }, [label]);

    React.useEffect(() => {
        if (!enabled) {
            stableLabelRef.current = label;
            setStableLabel(label);
            return;
        }

        if (!label || label === stableLabelRef.current) {
            return;
        }

        if (isFallbackWorkGroupLabel(label) && stableLabelRef.current) {
            return;
        }

        if (!stableLabelRef.current || isFallbackWorkGroupLabel(stableLabelRef.current)) {
            stableLabelRef.current = label;
            setStableLabel(label);
            return;
        }

        const timeout = window.setTimeout(() => {
            const nextLabel = latestLabelRef.current;

            if (!nextLabel || isFallbackWorkGroupLabel(nextLabel)) {
                return;
            }

            stableLabelRef.current = nextLabel;
            setStableLabel(nextLabel);
        }, activeHeaderDwellMs);

        return () => window.clearTimeout(timeout);
    }, [enabled, label]);

    return stableLabel;
}

function isFallbackWorkGroupLabel(label: string) {
    return label === 'Working' || label === 'Worked';
}

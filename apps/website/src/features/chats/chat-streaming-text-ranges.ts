import * as React from 'react';
import { commonPrefixLength } from './use-revealed-text.ts';

const defaultStreamingTextRangeDurationMs = 920;
const maxStreamingTextRanges = 18;

export interface StreamingTextRange {
    createdAt: number;
    end: number;
    id: string;
    start: number;
}

export function useStreamingTextRanges(
    text: string,
    {
        durationMs = defaultStreamingTextRangeDurationMs,
        enabled,
    }: {
        durationMs?: number;
        enabled: boolean;
    }
) {
    const previousTextRef = React.useRef(text);
    const rangesRef = React.useRef<StreamingTextRange[]>([]);
    const [ranges, setRanges] = React.useState<StreamingTextRange[]>([]);

    React.useLayoutEffect(() => {
        if (!enabled) {
            previousTextRef.current = text;
            // Settled text runs this on every mount and on every desktop tab
            // reveal; with nothing to clear, it queues no render.
            if (rangesRef.current.length > 0) {
                rangesRef.current = [];
                setRanges([]);
            }
            return;
        }

        const nextRanges = getNextStreamingTextRanges({
            durationMs,
            nextText: text,
            now: performance.now(),
            previousText: previousTextRef.current,
            ranges: rangesRef.current,
        });

        previousTextRef.current = text;
        rangesRef.current = nextRanges;
        setRanges(nextRanges);
    }, [durationMs, enabled, text]);

    React.useEffect(() => {
        if (!(enabled && ranges.length > 0)) {
            return;
        }

        const nextExpiresAt = Math.min(...ranges.map((range) => range.createdAt + durationMs));
        const timer = window.setTimeout(
            () => {
                const nextRanges = pruneStreamingTextRanges({
                    durationMs,
                    now: performance.now(),
                    ranges: rangesRef.current,
                    textLength: previousTextRef.current.length,
                });

                rangesRef.current = nextRanges;
                setRanges(nextRanges);
            },
            Math.max(16, nextExpiresAt - performance.now())
        );

        return () => window.clearTimeout(timer);
    }, [durationMs, enabled, ranges]);

    return ranges;
}

export function getNextStreamingTextRanges({
    durationMs = defaultStreamingTextRangeDurationMs,
    nextText,
    now,
    previousText,
    ranges,
}: {
    durationMs?: number;
    nextText: string;
    now: number;
    previousText: string;
    ranges: StreamingTextRange[];
}) {
    const prefixLength = commonPrefixLength(previousText, nextText);
    const activeRanges = nextText.startsWith(previousText)
        ? pruneStreamingTextRanges({
              durationMs,
              now,
              ranges,
              textLength: nextText.length,
          })
        : [];

    if (nextText.length <= prefixLength) {
        return activeRanges;
    }

    return [
        ...activeRanges,
        {
            createdAt: now,
            end: nextText.length,
            id: `${prefixLength}:${nextText.length}:${Math.round(now)}`,
            start: prefixLength,
        },
    ].slice(-maxStreamingTextRanges);
}

export function pruneStreamingTextRanges({
    durationMs = defaultStreamingTextRangeDurationMs,
    now,
    ranges,
    textLength,
}: {
    durationMs?: number;
    now: number;
    ranges: StreamingTextRange[];
    textLength: number;
}) {
    return ranges.filter(
        (range) =>
            range.start < range.end && range.end <= textLength && now - range.createdAt < durationMs
    );
}

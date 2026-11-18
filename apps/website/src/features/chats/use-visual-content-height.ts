import { visualSizeMessageType } from '@haus/api/widgets/visual/frame';
import * as React from 'react';
import { visualHeightCache, visualIdentity } from './visual-height-cache.ts';

/**
 * The content height a visual card should reserve: the frame's own report once
 * it arrives, else the last height this visual reported at a similar width, else
 * null (the card falls back). Reports always win, so a stale cache entry
 * corrects on the frame's first report. While `streaming`, the body is still
 * growing — it is neither looked up nor recorded, so partial documents never
 * pollute the cache.
 */
export function useVisualContentHeight({
    containerRef,
    frameRef,
    html,
    streaming,
}: {
    containerRef: React.RefObject<HTMLElement | null>;
    frameRef: React.RefObject<HTMLIFrameElement | null>;
    html: string;
    streaming: boolean;
}): number | null {
    const identity = React.useMemo(
        () => (streaming ? null : visualIdentity(html)),
        [html, streaming]
    );
    const width = useMountWidth(containerRef);
    const reported = useReportedContentHeight(frameRef, (height) => {
        const currentWidth = containerRef.current?.clientWidth ?? 0;
        if (identity !== null && currentWidth > 0) {
            visualHeightCache.record(identity, currentWidth, height);
        }
    });

    if (reported !== null) {
        return reported;
    }
    return identity === null ? null : visualHeightCache.read(identity, width);
}

// Measured once before first paint so the cache lookup can pick the right width
// bucket; later width changes arrive through the frame's own size reports.
function useMountWidth(containerRef: React.RefObject<HTMLElement | null>) {
    const [width, setWidth] = React.useState<number | null>(null);

    React.useLayoutEffect(() => {
        const measured = containerRef.current?.clientWidth ?? 0;
        if (measured > 0) {
            setWidth(measured);
        }
    }, [containerRef]);

    return width;
}

// Size messages are only trusted when they come from this card's own frame;
// anything else on the window channel is ignored.
function useReportedContentHeight(
    frameRef: React.RefObject<HTMLIFrameElement | null>,
    onReport: (height: number) => void
) {
    const [height, setHeight] = React.useState<number | null>(null);
    const onReportRef = React.useRef(onReport);
    React.useLayoutEffect(() => {
        onReportRef.current = onReport;
    });

    React.useEffect(() => {
        function onMessage(event: MessageEvent) {
            if (!frameRef.current || event.source !== frameRef.current.contentWindow) {
                return;
            }
            const data = event.data as { height?: unknown; type?: unknown } | null;
            if (data?.type !== visualSizeMessageType || typeof data.height !== 'number') {
                return;
            }
            if (Number.isFinite(data.height) && data.height > 0) {
                setHeight(data.height);
                onReportRef.current(data.height);
            }
        }

        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [frameRef]);

    return height;
}

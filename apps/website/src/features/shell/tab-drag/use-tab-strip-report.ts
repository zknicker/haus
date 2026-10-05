import * as React from 'react';
import { getDesktopBridge } from '../../../lib/desktop-bridge.ts';

/**
 * Tells Electron where this window's band is (client px) and which Server it
 * shows, so a tab dragged from another window can find it and join it
 * (ADR 0039). Reports on mount, on resize, and on Electron's `measure`; the
 * band leaving reports null. Returns the reporter for `measure`.
 */
export function useTabStripReport(
    band: React.RefObject<HTMLElement | null>,
    serverId: string
): () => void {
    const report = React.useCallback(() => {
        const element = band.current;
        if (!element) {
            return;
        }
        const { height, width, x, y } = element.getBoundingClientRect();
        void getDesktopBridge()
            ?.tabStripReport?.({ rect: { height, width, x, y }, serverId })
            .catch(() => undefined);
    }, [band, serverId]);
    React.useEffect(() => {
        const element = band.current;
        const bridge = getDesktopBridge();
        if (!(element && bridge?.tabStripReport)) {
            return;
        }
        report();
        const observer = new ResizeObserver(report);
        observer.observe(element);
        window.addEventListener('resize', report);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', report);
            void bridge.tabStripReport?.(null).catch(() => undefined);
        };
    }, [band, report]);
    return report;
}

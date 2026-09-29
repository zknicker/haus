import { toast } from '@heroui/react';
import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';

export function useBrowserViewBounds(
    host: React.RefObject<HTMLDivElement | null>,
    hidden: boolean
) {
    React.useLayoutEffect(() => {
        const element = host.current;
        const setBounds = getDesktopBridge()?.browserBounds;
        if (!(element && setBounds)) {
            return;
        }
        let frame = 0;
        let lastBounds = '';
        let reportedFailure = false;
        const report = (error: Error) => {
            if (!reportedFailure) {
                reportedFailure = true;
                toast.danger('Browser view unavailable', { description: error.message });
            }
        };
        const resize = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                // Native views paint above DOM overlays, so product menus temporarily hide the page.
                const rect = element.getBoundingClientRect();
                const overlay = [
                    ...document.querySelectorAll(
                        '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"]'
                    ),
                ].some((node) => {
                    const overlayRect = node.getBoundingClientRect();
                    return (
                        node.getClientRects().length > 0 &&
                        overlayRect.bottom > rect.top &&
                        overlayRect.top < rect.bottom &&
                        overlayRect.right > rect.left &&
                        overlayRect.left < rect.right
                    );
                });
                const bounds =
                    overlay || hidden
                        ? null
                        : { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                const key = JSON.stringify(bounds);
                if (key !== lastBounds) {
                    lastBounds = key;
                    void setBounds(bounds).catch(report);
                }
            });
        };
        const observer = new ResizeObserver(resize);
        const overlays = new MutationObserver(resize);
        observer.observe(element);
        overlays.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('resize', resize);
        resize();
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            overlays.disconnect();
            window.removeEventListener('resize', resize);
            void setBounds(null).catch(report);
        };
    }, [host, hidden]);
}

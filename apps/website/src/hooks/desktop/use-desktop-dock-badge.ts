import { useEffect } from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';

/** Mirrors the unread total onto the macOS Dock icon; clears on unmount. */
export function useDesktopDockBadge(unreadTotal: number) {
    useEffect(() => {
        void getDesktopBridge()?.setDockBadge?.(unreadTotal);
    }, [unreadTotal]);

    useEffect(
        () => () => {
            void getDesktopBridge()?.setDockBadge?.(0);
        },
        []
    );
}

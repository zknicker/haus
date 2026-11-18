import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';

export function isAppForegrounded(input: { documentVisible: boolean; windowFocused: boolean }) {
    return input.documentVisible && input.windowFocused;
}

export function useAppForegrounded() {
    const [documentVisible, setDocumentVisible] = React.useState(() =>
        typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'
    );
    const [windowFocused, setWindowFocused] = React.useState(() =>
        typeof document === 'undefined' ? true : document.hasFocus()
    );

    React.useEffect(() => {
        const handleVisibilityChange = () => {
            setDocumentVisible(document.visibilityState !== 'hidden');
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        const bridge = getDesktopBridge();

        if (bridge?.onWindowFocusChanged) {
            const unsubscribe = bridge.onWindowFocusChanged((focused) => {
                setWindowFocused(focused);
            });

            return () => {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
                unsubscribe();
            };
        }

        const handleFocus = () => setWindowFocused(true);
        const handleBlur = () => setWindowFocused(false);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('blur', handleBlur);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('blur', handleBlur);
        };
    }, []);

    return isAppForegrounded({ documentVisible, windowFocused });
}

import { Spinner } from '@heroui/react';
import * as React from 'react';
import { cn } from '../../lib/utils.ts';

const loadingIndicatorDelayMs = 180;

export function ChatTranscriptLoadingIndicator({
    className,
    visible,
}: {
    className?: string;
    visible: boolean;
}) {
    const [show, setShow] = React.useState(false);

    React.useEffect(() => {
        if (!visible) {
            setShow(false);
            return;
        }

        const timeout = window.setTimeout(() => setShow(true), loadingIndicatorDelayMs);
        return () => window.clearTimeout(timeout);
    }, [visible]);

    if (!show) {
        return null;
    }

    return (
        <output
            aria-label="Loading chat transcript"
            className={cn(
                'text-muted pointer-events-none inline-flex animate-[chat-loading-indicator-in_160ms_cubic-bezier(0.23,1,0.32,1)_both] items-center justify-center',
                className
            )}
        >
            <Spinner color="current" size="sm" />
        </output>
    );
}

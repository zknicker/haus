import * as React from 'react';

export function useTakeoverKeys({
    onDigit,
    onSubmit,
}: {
    onDigit?: (index: number) => void;
    onSubmit: () => void;
}) {
    const handleKeyDown = React.useEffectEvent((event: KeyboardEvent) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSubmit();
            return;
        }
        const digit = Number(event.key);
        if (
            onDigit &&
            Number.isInteger(digit) &&
            digit >= 1 &&
            !(event.metaKey || event.ctrlKey || event.altKey) &&
            !isTextEntry(event.target)
        ) {
            event.preventDefault();
            onDigit(digit - 1);
        }
    });

    React.useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);
}

function isTextEntry(target: EventTarget | null) {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
    );
}

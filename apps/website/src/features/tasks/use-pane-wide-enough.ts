import * as React from 'react';

export function usePaneWideEnough(ref: React.RefObject<HTMLElement | null>, minWidth: number) {
    const [wide, setWide] = React.useState(false);
    React.useLayoutEffect(() => {
        const element = ref.current;
        if (!element) {
            return;
        }
        const measure = () => setWide(element.clientWidth >= minWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [minWidth, ref]);
    return wide;
}

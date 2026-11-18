import * as React from 'react';

/** Follows the element's own width, which on desktop is the pane's, not the window's. */
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

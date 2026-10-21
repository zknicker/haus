import * as React from 'react';

/**
 * A ref for an end-of-list sentinel: `onReachEnd` fires when it comes within
 * `margin` px of its scroll region's visible edge. Watching restarts whenever
 * `isActive` or `onReachEnd` changes, so a sentinel still in view after a page
 * lands asks for the next one; callers hold `isActive` false while a page loads.
 */
export function useLoadMoreSentinel({
    isActive,
    margin = 400,
    onReachEnd,
}: {
    isActive: boolean;
    margin?: number;
    onReachEnd: () => void;
}) {
    const [node, setNode] = React.useState<HTMLElement | null>(null);
    React.useEffect(() => {
        if (!(isActive && node)) {
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    onReachEnd();
                }
            },
            { root: readScrollParent(node), rootMargin: `0px 0px ${margin}px 0px` }
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [isActive, margin, node, onReachEnd]);
    return setNode;
}

function readScrollParent(node: HTMLElement): HTMLElement | null {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const { overflowY } = getComputedStyle(parent);
        if (overflowY === 'auto' || overflowY === 'scroll') {
            return parent;
        }
    }
    return null;
}

import * as React from 'react';

type ScrollSnapshot = { anchor: HTMLElement; offset: number; scroller: HTMLElement } | null;

/** Capture before React changes layout, then keep the inspected row at the same offset. */
// biome-ignore lint/style/useReactFunctionComponents: React has no function-hook equivalent of getSnapshotBeforeUpdate.
export class TurnTraceScroll extends React.Component<{ children: React.ReactNode }> {
    private readonly root = React.createRef<HTMLDivElement>();

    getSnapshotBeforeUpdate(): ScrollSnapshot {
        const root = this.root.current;
        if (!root) {
            return null;
        }
        const scroller = findScroller(root);
        if (!scroller) {
            return null;
        }
        const top = scroller.getBoundingClientRect().top;
        const bottom = top + scroller.clientHeight;
        const anchors = [...root.querySelectorAll<HTMLElement>('[data-trace-anchor]')];
        const focused = document.activeElement?.closest<HTMLElement>('[data-trace-anchor]');
        const inspected = anchors.filter((anchor) =>
            anchor.querySelector('[aria-expanded="true"]')
        );
        const candidates =
            focused && root.contains(focused)
                ? [focused, ...inspected, ...anchors]
                : [...inspected, ...anchors];
        for (const anchor of candidates) {
            const rect = anchor.getBoundingClientRect();
            if (rect.bottom > top && rect.top < bottom) {
                return { anchor, offset: rect.top - top, scroller };
            }
        }
        return null;
    }

    componentDidUpdate(
        _previous: Readonly<{ children: React.ReactNode }>,
        _state: unknown,
        snapshot: ScrollSnapshot
    ) {
        if (!snapshot?.anchor.isConnected) {
            return;
        }
        const { anchor, offset, scroller } = snapshot;
        const nextOffset =
            anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTop += nextOffset - offset;
    }

    render() {
        return (
            <div className="grid min-w-0 gap-1" ref={this.root}>
                {this.props.children}
            </div>
        );
    }
}

function findScroller(root: HTMLElement): HTMLElement | null {
    for (let element = root.parentElement; element; element = element.parentElement) {
        if (/(auto|scroll)/u.test(getComputedStyle(element).overflowY)) {
            return element;
        }
    }
    return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

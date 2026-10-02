import * as React from 'react';

type ScrollSnapshot = { anchor: HTMLElement; offset: number; scroller: HTMLElement } | null;

/** Keep the inspected row at its offset through React commits and animated growth. */
// biome-ignore lint/style/useReactFunctionComponents: React has no function-hook equivalent of getSnapshotBeforeUpdate.
export class TurnTraceScroll extends React.Component<{ children: React.ReactNode }> {
    private readonly root = React.createRef<HTMLDivElement>();
    private observer: ResizeObserver | null = null;
    private snapshot: ScrollSnapshot = null;
    private scroller: HTMLElement | null = null;

    componentDidMount() {
        this.observer = new ResizeObserver(() => this.restoreScroll());
        if (this.root.current) {
            this.observer.observe(this.root.current);
        }
    }

    componentWillUnmount() {
        this.observer?.disconnect();
        this.watchScroller(null);
    }

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
        const active = document.activeElement;
        const focused = active?.closest<HTMLElement>('[data-trace-anchor]');
        if (active && root.contains(active) && !focused) {
            return null;
        }
        const anchors = [...root.querySelectorAll<HTMLElement>('[data-trace-anchor]')];
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
        this.snapshot = snapshot;
        this.watchScroller(snapshot?.scroller ?? null);
        this.restoreScroll();
    }

    render() {
        return (
            <div className="grid min-w-0 gap-1" ref={this.root}>
                {this.props.children}
            </div>
        );
    }

    private readonly forgetScroll = () => {
        this.snapshot = null;
    };

    private restoreScroll() {
        if (!this.snapshot?.anchor.isConnected) {
            this.snapshot = null;
            return;
        }
        const { anchor, offset, scroller } = this.snapshot;
        const nextOffset =
            anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTop += nextOffset - offset;
    }

    private watchScroller(scroller: HTMLElement | null) {
        if (scroller === this.scroller) {
            return;
        }
        for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
            this.scroller?.removeEventListener(event, this.forgetScroll, true);
            scroller?.addEventListener(event, this.forgetScroll, { capture: true, passive: true });
        }
        this.scroller = scroller;
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

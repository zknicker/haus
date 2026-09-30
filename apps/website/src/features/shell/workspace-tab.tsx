import * as React from 'react';
import { cn } from '../../lib/utils.ts';

/**
 * One workspace tab, for every kind: the routed primary tab, each browser
 * tab, and each artifact tab share this anatomy. The first child is the tab's own stock Button —
 * mark, then label — and it fills the tab, so the whole tab is the hit
 * target. A closable tab's trailing `action` rides inside the tab's end. Geometry, fill
 * states, and when the action shows live on `.workspace-tab` in
 * `styles/default-theme.css`; this component only gives those rules markup to
 * hang on.
 */
export function WorkspaceTab({
    action,
    active,
    children,
    className,
    kind,
    ref,
    ...rest
}: Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & {
    action?: React.ReactNode;
    active: boolean;
    children: React.ReactNode;
    kind: 'artifact' | 'browser' | 'primary';
    ref?: React.Ref<HTMLDivElement>;
}) {
    return (
        <div
            {...rest}
            className={cn('workspace-tab no-drag', className)}
            data-active={active}
            data-kind={kind}
            ref={ref}
        >
            {children}
            {action}
        </div>
    );
}

/**
 * The tab's 16px leading mark slot. Identity marks (a channel box, an avatar),
 * glyphs, and favicons all fill it, so every kind's title starts at the same
 * inset.
 */
export function WorkspaceTabMark({ children }: { children: React.ReactNode }) {
    return <span className="workspace-tab__mark">{children}</span>;
}

/**
 * The tab's title. A cut-off title fades out at its end (Codex's truncation);
 * the fade needs to know it is cut off, or it would dim a short title's last
 * letters, so the label marks itself `data-overflowing`.
 */
export function WorkspaceTabLabel({ children }: { children: string }) {
    const ref = React.useRef<HTMLSpanElement>(null);
    const [overflowing, setOverflowing] = React.useState(false);
    // biome-ignore lint/correctness/useExhaustiveDependencies: a new title can overflow at the same box size, which no resize reports.
    React.useLayoutEffect(() => {
        const label = ref.current;
        if (!label) {
            return;
        }
        const measure = () => setOverflowing(label.scrollWidth > label.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(label);
        return () => observer.disconnect();
    }, [children]);
    return (
        <span
            className="workspace-tab__label"
            data-overflowing={overflowing || undefined}
            ref={ref}
        >
            {children}
        </span>
    );
}

/** A closable tab's trailing close slot. */
export function WorkspaceTabAction({ children }: { children: React.ReactNode }) {
    return <span className="workspace-tab__action">{children}</span>;
}

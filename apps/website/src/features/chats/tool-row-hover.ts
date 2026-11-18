import { AnimatePresence, motion } from 'framer-motion';
import * as React from 'react';
import { type ItemRect, useProximityHover } from '../../hooks/use-proximity-hover.ts';
import { springs } from '../../lib/springs.ts';

interface ToolRowHoverContextValue {
    registerItem: (index: number, element: HTMLElement | null) => void;
}

const ToolRowHoverContext = React.createContext<ToolRowHoverContextValue | null>(null);

export function ToolRowHoverRoot({
    children,
    value,
}: {
    children: React.ReactNode;
    value: ToolRowHoverContextValue | null;
}) {
    return React.createElement(ToolRowHoverContext.Provider, { value }, children);
}

/**
 * Fluid-functionalism moving hover for a work group's tool rows: one shared
 * rect glides to the row nearest the pointer (proximity tracking, the same
 * helper the Table primitive uses) instead of blinking per row. Scoped to the
 * rows content element so the group header keeps its own hover.
 */
export function useToolRowHoverGroup({
    enabled,
    measureKey,
}: {
    enabled: boolean;
    measureKey: string;
}) {
    const contentRef = React.useRef<HTMLDivElement | null>(null);
    const {
        activeIndex,
        handlers,
        itemRects,
        measureItems,
        registerItem,
        sessionRef,
        setActiveIndex,
    } = useProximityHover(contentRef);

    React.useEffect(() => {
        if (!enabled) {
            return;
        }

        const content = contentRef.current;

        if (!content) {
            return;
        }

        content.addEventListener('mouseenter', handlers.onMouseEnter);
        content.addEventListener('mousemove', handlers.onMouseMove);
        content.addEventListener('mouseleave', handlers.onMouseLeave);

        return () => {
            content.removeEventListener('mouseenter', handlers.onMouseEnter);
            content.removeEventListener('mousemove', handlers.onMouseMove);
            content.removeEventListener('mouseleave', handlers.onMouseLeave);
        };
    }, [enabled, handlers.onMouseEnter, handlers.onMouseMove, handlers.onMouseLeave]);

    React.useEffect(() => {
        if (enabled && measureKey.length > 0) {
            measureItems();
        }
    }, [enabled, measureItems, measureKey]);

    const clearActiveItem = React.useCallback(() => {
        setActiveIndex(null);
    }, [setActiveIndex]);

    const contextValue = React.useMemo(() => ({ registerItem }), [registerItem]);
    const activeRect = activeIndex === null ? null : (itemRects[activeIndex] ?? null);

    return {
        clearActiveItem,
        contentRef,
        contextValue: enabled ? contextValue : null,
        hoverLayer: enabled
            ? React.createElement(ToolRowHoverHighlight, {
                  activeRect,
                  sessionKey: sessionRef.current,
              })
            : null,
    };
}

export function useToolRowHoverItem(index: number) {
    const context = React.useContext(ToolRowHoverContext);

    const ref = React.useCallback(
        (element: HTMLElement | null) => {
            context?.registerItem(index, element);
        },
        [context, index]
    );

    return {
        dataIndex: context ? index : undefined,
        hasSharedHover: Boolean(context),
        ref,
    };
}

function ToolRowHoverHighlight({
    activeRect,
    sessionKey,
}: {
    activeRect: ItemRect | null;
    sessionKey: number;
}) {
    if (!activeRect) {
        return null;
    }

    return React.createElement(
        AnimatePresence,
        null,
        React.createElement(
            motion.div,
            {
                'aria-hidden': 'true',
                className: 'pointer-events-none absolute inset-0 z-0 overflow-hidden',
                exit: { opacity: 0, transition: { duration: 0.06 } },
                key: sessionKey,
            },
            React.createElement(motion.div, {
                animate: {
                    opacity: 1,
                    top: activeRect.top,
                    left: activeRect.left,
                    width: activeRect.width,
                    height: activeRect.height,
                },
                className:
                    'absolute rounded-[var(--tool-row-hover-radius,var(--radius-md))] bg-surface-hover',
                initial: {
                    opacity: 0,
                    top: activeRect.top,
                    left: activeRect.left,
                    width: activeRect.width,
                    height: activeRect.height,
                },
                transition: {
                    ...springs.fast,
                    opacity: { duration: 0.08 },
                },
            })
        )
    );
}

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import * as React from 'react';

import { ResizablePaneRail } from '../../components/ui/resizable-pane-rail.tsx';
import {
    artifactPaneWidthLimits,
    useArtifactPaneWidth,
} from '../../hooks/pane/use-artifact-pane-width.ts';
import { cn } from '../../lib/utils.ts';

export function ChatSidePaneShell({
    children,
    keepMounted = false,
    label,
    onExitComplete,
    open,
    takeover = false,
}: {
    children: (width: number | null) => React.ReactNode;
    keepMounted?: boolean;
    label: string;
    onExitComplete?: () => void;
    open: boolean;
    takeover?: boolean;
}) {
    const shouldReduceMotion = useReducedMotion();
    const [resizing, setResizing] = React.useState(false);
    const paneWidth = useArtifactPaneWidth();
    const openMotion = takeover
        ? { opacity: 1, x: 0 }
        : { opacity: 1, width: paneWidth.width, x: 0 };
    const closedMotion = takeover ? { opacity: 0, x: 18 } : { opacity: 0, width: 0, x: 36 };
    const transition = shouldReduceMotion
        ? { duration: 0.12 }
        : {
              opacity: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const },
              width: {
                  duration: resizing ? 0 : 0.28,
                  ease: [0.16, 1, 0.3, 1] as const,
              },
              x: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const },
          };

    const pane = (
        <motion.aside
            animate={keepMounted && !open ? closedMotion : openMotion}
            aria-hidden={keepMounted && !open ? true : undefined}
            aria-label={label}
            className={cn(
                'border-separator bg-background relative flex h-full min-h-0 shrink-0 overflow-hidden border-l',
                takeover ? 'min-w-0 flex-1 shrink border-l-0' : 'z-[36]'
            )}
            exit={closedMotion}
            inert={keepMounted && !open}
            initial={shouldReduceMotion ? false : closedMotion}
            onAnimationComplete={() => {
                if (keepMounted && !open) {
                    onExitComplete?.();
                }
            }}
            transition={transition}
        >
            {takeover ? null : (
                <ResizablePaneRail
                    maxWidth={artifactPaneWidthLimits.max}
                    minWidth={artifactPaneWidthLimits.min}
                    onResizeEnd={() => setResizing(false)}
                    onResizeStart={() => setResizing(true)}
                    onWidthChange={paneWidth.setWidth}
                    onWidthCommit={paneWidth.persistWidth}
                    side="left"
                    width={paneWidth.width}
                />
            )}
            {children(takeover ? null : paneWidth.width)}
        </motion.aside>
    );

    if (keepMounted) {
        return pane;
    }

    return <AnimatePresence onExitComplete={onExitComplete}>{open ? pane : null}</AnimatePresence>;
}

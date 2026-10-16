import { AnimatePresence, motion, type Transition, useReducedMotion } from 'motion/react';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { springs } from '../../../../../lib/springs.ts';

/** Content that swaps in fades on the transcript's step-entrance curve. */
const fadeIn: Transition = { duration: 0.18, ease: [0.23, 1, 0.32, 1] };

function heightTransition(reducedMotion: boolean | null): Transition {
    return reducedMotion ? { duration: 0 } : { height: springs.drawer, opacity: fadeIn };
}

/**
 * The identity setup opening under its Agent's row: its height grows on the
 * shared no-bounce spring so the rows below slide rather than jump, and it
 * closes along the same path. Springs start from the current height, so a
 * reopen mid-close reverses smoothly. Clipped only while it moves, so a
 * settled panel keeps its focus rings. Once open it scrolls itself into view
 * only as far as needed. Reduced motion places it at once.
 */
export function LinearSetupDisclosure({ children, open }: { children: ReactNode; open: boolean }) {
    const reducedMotion = useReducedMotion();
    const panel = useRef<HTMLDivElement>(null);

    return (
        <AnimatePresence initial={false}>
            {open ? (
                <motion.div
                    animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
                    exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
                    initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
                    key="setup"
                    onAnimationComplete={(definition) => {
                        if (isOpened(definition)) {
                            panel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    }}
                    ref={panel}
                    transition={heightTransition(reducedMotion)}
                >
                    {children}
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}

/**
 * Follows its content's height on the same spring, so a step collapsing to
 * its ticked line while the next one opens reads as one smooth change rather
 * than a jump. The measured box is the content itself; nothing inside moves
 * except by its own layout.
 */
export function LinearSetupHeight({ children }: { children: ReactNode }) {
    const reducedMotion = useReducedMotion();
    const inner = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState<number | 'auto'>('auto');
    // Clip only while moving; at rest the fields' focus rings must not be cut off.
    const [moving, setMoving] = useState(false);

    useLayoutEffect(() => {
        const element = inner.current;
        if (!element) {
            return;
        }
        // Clip in the same render as the new height, so grown content never paints over the rows below.
        let last = element.offsetHeight;
        const observer = new ResizeObserver(() => {
            const next = element.offsetHeight;
            // A width-only resize starts no animation, so it must not start clipping either.
            if (next !== last) {
                last = next;
                setMoving(true);
            }
            setHeight(next);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    return (
        <motion.div
            animate={{ height }}
            initial={false}
            onAnimationComplete={() => setMoving(false)}
            style={{ overflow: moving ? 'hidden' : 'visible' }}
            transition={heightTransition(reducedMotion)}
        >
            <div ref={inner}>{children}</div>
        </motion.div>
    );
}

function isOpened(definition: unknown) {
    return (
        typeof definition === 'object' &&
        definition !== null &&
        'height' in definition &&
        definition.height === 'auto'
    );
}

/**
 * A step's open controls: they fade in as the step becomes current, so the
 * content that swaps reads as arriving rather than snapping in.
 */
export function LinearSetupReveal({
    children,
    className,
}: {
    children: ReactNode;
    className: string;
}) {
    const reducedMotion = useReducedMotion();

    return (
        <motion.div
            animate={{ opacity: 1 }}
            className={className}
            initial={{ opacity: 0 }}
            transition={reducedMotion ? { duration: 0 } : fadeIn}
        >
            {children}
        </motion.div>
    );
}

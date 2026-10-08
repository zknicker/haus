import { ImageUpload01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { springs } from '../../../lib/springs.ts';

/**
 * Covers the composer's drop surface while a file drag is over it: the
 * conversation recedes behind a scrim and an inset accent frame names the
 * gesture. It never takes pointer events, so the drag keeps hitting the
 * surface underneath and the hit target never changes mid-drag.
 */
export function ComposerDropOverlay({
    active,
    container,
}: {
    active: boolean;
    container: HTMLElement | null;
}) {
    const reduceMotion = useReducedMotion();

    if (!container) {
        return null;
    }

    return createPortal(
        <AnimatePresence initial={false}>
            {active ? (
                <motion.div
                    animate={{ opacity: 1 }}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-30 p-3"
                    data-testid="composer-file-drop-overlay"
                    exit={{ opacity: 0, transition: springs.fast }}
                    initial={{ opacity: 0 }}
                    transition={springs.moderate}
                >
                    <div className="absolute inset-0 bg-background opacity-90" />
                    <motion.div
                        animate={{ scale: 1 }}
                        className="card-shell relative flex size-full flex-col items-center justify-center border-2 border-accent border-dashed"
                        exit={reduceMotion ? undefined : { scale: 0.99 }}
                        initial={reduceMotion ? false : { scale: 0.98 }}
                        transition={springs.moderate}
                    >
                        <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-overlay">
                            <Icon className="size-6" icon={ImageUpload01Icon} />
                        </span>
                        <p className="font-semibold text-base text-foreground">
                            Drop files to attach
                        </p>
                        <p className="mt-1 text-muted text-sm">Images and files up to 50 MB</p>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>,
        container
    );
}

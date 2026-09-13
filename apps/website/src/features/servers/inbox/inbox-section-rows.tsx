import { Separator } from '@heroui/react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode, Ref } from 'react';
import { springs } from '../../../lib/springs.ts';
import { InboxSectionRows } from './inbox-section.tsx';

/** One Inbox row's height, which is the slot's height and the strip's floor. */
export const inboxRowHeight = 56;

/**
 * The one transition every Inbox arrival, departure, and reorder rides. It is
 * the app's own `springs.slow` with the bounce taken out: an Inbox row is a
 * record appearing, not a control responding to a press, and a record that
 * overshoots reads as excited about itself.
 */
const inboxRowTransition = { ...springs.slow, bounce: 0 };

/**
 * A section's rows, and the slot they land in when there are none.
 *
 * The slot is the point. An empty section used to be a line of text, which
 * said the right thing and showed nothing: the reader learned that the section
 * was empty but never learned what would fill it or where. A slot exactly one
 * row tall, inside the frame the rows would share, says both — this is the
 * shape of the thing that is missing, and here is where it will be — and it
 * makes the arrival continuous, because the box it hands over is already the
 * size of the row that takes it.
 *
 * Blank-until-settled belongs to the section, not to this: a section renders
 * this only once its reads have settled, so a slot always means empty and
 * never means loading.
 */
export function InboxRowList<Row extends { id: string }>({
    emptyLabel,
    listId,
    renderRow,
    rows,
}: {
    /** The fact a settled, empty section states, in the slot. */
    emptyLabel: string;
    /** Scopes layout animation to this list, so two sections never pair rows. */
    listId: string;
    renderRow: (row: Row) => ReactNode;
    rows: readonly Row[];
}) {
    return (
        <InboxSectionRows>
            <LayoutGroup id={listId}>
                <AnimatePresence initial={false} mode="popLayout">
                    {rows.length === 0 ? (
                        <InboxEmptySlot key={`${listId}-empty`} label={emptyLabel} />
                    ) : (
                        rows.map((row, index) => (
                            <InboxMotionItem key={row.id}>
                                {index === 0 ? null : <Separator />}
                                {renderRow(row)}
                            </InboxMotionItem>
                        ))
                    )}
                </AnimatePresence>
            </LayoutGroup>
        </InboxSectionRows>
    );
}

/**
 * One arriving, leaving, or moving thing: a row in a section's list, or a card
 * in the week strip. It fades up a few pixels on arrival and a few pixels away
 * on exit, and `layout` carries it when the list reorders under it, so a row
 * that changes place slides rather than teleports.
 */
export function InboxMotionItem({
    children,
    className = 'min-w-0',
    ref,
}: {
    children: ReactNode;
    /** The track's own sizing: rows fill the column, strip cards keep width. */
    className?: string;
    /**
     * `popLayout`'s own ref. `AnimatePresence` clones a leaving child with a
     * ref and measures the node to pin it out of flow; a component that eats
     * the ref measures nothing, so the pop never happens and the neighbours
     * wait for the exit instead of closing over it.
     */
    ref?: Ref<HTMLDivElement>;
}) {
    const shouldReduceMotion = useReducedMotion() === true;

    return (
        <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={className}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            layout={shouldReduceMotion ? false : 'position'}
            ref={ref}
            transition={
                shouldReduceMotion
                    ? { duration: 0 }
                    : { default: inboxRowTransition, layout: inboxRowTransition }
            }
        >
            {children}
        </motion.div>
    );
}

/**
 * The settled empty section: one row-shaped slot, in whatever track the
 * section's own body is — inside the row frame for the three boxed sections,
 * bare on the card track for the week strip, which has no frame to sit in.
 *
 * A dashed outline and no fill, because a filled block that pulses is a
 * skeleton, and a skeleton promises that something is loading. This promises
 * nothing — it is the settled answer, drawn as the outline of the row that
 * isn't there. The breathing is deliberately below the threshold of a
 * skeleton's: a quarter of opacity over four and a half seconds, gone under
 * reduced motion.
 */
export function InboxEmptySlot({
    className = 'p-1.5',
    label,
    ref,
}: {
    /** The track's own sizing: the strip's slot fills the track's width. */
    className?: string;
    label: string;
    /** `popLayout`'s own ref, for the same reason `InboxMotionItem` takes one. */
    ref?: Ref<HTMLDivElement>;
}) {
    const shouldReduceMotion = useReducedMotion() === true;

    return (
        <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={className}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            layout={shouldReduceMotion ? false : 'position'}
            ref={ref}
            style={{ height: inboxRowHeight }}
            transition={
                shouldReduceMotion
                    ? { duration: 0 }
                    : { default: inboxRowTransition, layout: inboxRowTransition }
            }
        >
            <motion.p
                animate={shouldReduceMotion ? undefined : { opacity: [0.75, 1, 0.75] }}
                className="flex h-full items-center rounded-xl border border-border border-dashed ps-2.5 text-muted text-sm"
                transition={
                    shouldReduceMotion
                        ? undefined
                        : { duration: 4.5, ease: 'easeInOut', repeat: Number.POSITIVE_INFINITY }
                }
            >
                {label}
            </motion.p>
        </motion.div>
    );
}

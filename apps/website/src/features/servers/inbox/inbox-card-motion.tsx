import { motion, type Transition, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * One Unread card arriving, leaving, or moving in the bare feed.
 *
 * A card is a few hundred pixels tall, so the row motion (`InboxMotionItem`)
 * does not scale to it: popping a leaving card out of flow let the cards
 * below spring up underneath it while it was still fading, and an arriving
 * card took its whole height in one frame, shoving the feed down at once.
 * Here a card's room opens and closes as its height, so nothing overlaps and
 * nothing jumps: a leaving card fades first, then its space closes; an
 * arriving card's space opens, then it fades in. The cards around it are in
 * flow, so they follow the height continuously.
 *
 * The space between cards rides inside the item (`pb-2.5`, the feed's step),
 * so a closing card takes its gap with it. Clipping holds only while the
 * height moves: a settled card shows its shadow, ring, and the hover actions
 * that float above its message.
 *
 * `layout` carries a card that changes place (a reply lands in a card further
 * down and lifts it to the top), keyed on membership as the rows are.
 */
export function InboxCardMotionItem({
    children,
    layoutKey,
}: {
    children: ReactNode;
    /** The list's `inboxLayoutKey`: the only change that may move this item. */
    layoutKey: string;
}) {
    const shouldReduceMotion = useReducedMotion() === true;
    if (shouldReduceMotion) {
        return (
            <motion.div
                animate={{ opacity: 1 }}
                className="min-w-0 pb-2.5"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                transition={{ duration: 0 }}
            >
                {children}
            </motion.div>
        );
    }
    return (
        <motion.div
            animate={{
                height: 'auto',
                opacity: 1,
                transition: { height: room, opacity: { ...fade, delay: 0.1 } },
                transitionEnd: { overflow: 'visible' },
            }}
            className="min-w-0"
            exit={{
                height: 0,
                opacity: 0,
                overflow: 'hidden',
                transition: { height: { ...room, delay: 0.08 }, opacity: fade },
            }}
            initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
            layout="position"
            layoutDependency={layoutKey}
            transition={{ layout: room }}
        >
            <div className="pb-2.5">{children}</div>
        </motion.div>
    );
}

/** The emphasized-decelerate curve: a quick start that settles without overshoot. */
const room: Transition = { duration: 0.28, ease: [0.2, 0, 0, 1] };
const fade: Transition = { duration: 0.16, ease: 'easeOut' };

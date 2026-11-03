import type { AdventEntry } from '@haus/api';
import { Tooltip } from '@heroui/react';
import { SquareLock02Icon } from '@hugeicons-pro/core-solid-rounded';
import { motion, useReducedMotion } from 'motion/react';
import type * as React from 'react';
import { Button as DoorButton } from 'react-aria-components';
import { Icon } from '../../components/ui/icon.tsx';
import { AdventLine } from './advent-line.tsx';
import { type DoorState, doorColor } from './advent-season.ts';
import { doorArt, nicheArt } from './door-art.ts';
import { dayOrnament, ornamentArt } from './ornaments.ts';

/**
 * One painted door of the calendar. Past doors stand open on their lit
 * niche with the day's ornament; today's glows until it is pressed, then
 * swings back on its hinge (0.5s) as the ornament pops out with a burst of
 * glints; the days to come are frosted and locked. `revealing` marks the
 * door the member just opened, the one door whose opening animates.
 *
 * The door is a bare React Aria button so the painting is the whole control;
 * its tooltip is the stock HeroUI Tooltip.
 */
export function AdventDoor({
    day,
    entry,
    onOpen,
    revealing,
    state,
}: {
    day: number;
    entry: AdventEntry | null;
    onOpen: (day: number) => void;
    revealing: boolean;
    state: DoorState;
}) {
    const reducedMotion = useReducedMotion() === true;
    const color = doorColor(day);
    const ornament = dayOrnament(day);
    const showsOrnament = state === 'past' || state === 'today-open';
    const hasLeaf = state !== 'past';
    const animateOpening = revealing && !reducedMotion;

    return (
        <Tooltip delay={250}>
            <DoorButton
                aria-label={doorLabel(day, state, entry)}
                className="advent-door rounded-xl outline-none data-[focus-visible]:ring-2 data-[focus-visible]:ring-focus"
                data-color={color}
                data-door={day}
                data-state={state}
                onPress={() => onOpen(day)}
            >
                {state === 'today-closed' || state === 'today-open' ? (
                    <span aria-hidden="true" className="advent-door__glow" />
                ) : null}
                <img
                    alt=""
                    className="advent-door__niche"
                    draggable={false}
                    height={140}
                    src={nicheArt}
                    width={120}
                />
                {showsOrnament ? (
                    <motion.img
                        alt=""
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="advent-door__ornament"
                        data-ornament={ornament}
                        draggable={false}
                        height={96}
                        initial={animateOpening ? { opacity: 0, scale: 0, y: 6 } : false}
                        src={ornamentArt[ornament]}
                        transition={{ delay: 0.3, duration: 0.45, ease: easeOutBack }}
                        width={96}
                    />
                ) : null}
                {animateOpening ? <Sparkles /> : null}
                {hasLeaf ? (
                    <motion.span
                        animate={
                            state === 'today-open'
                                ? { filter: 'brightness(0.72)', rotateY: -76 }
                                : { filter: 'brightness(1)', rotateY: 0 }
                        }
                        aria-hidden="true"
                        className="advent-door__leaf"
                        initial={false}
                        transition={{
                            duration: animateOpening ? 0.5 : 0,
                            ease: [0.45, 0, 0.55, 1],
                        }}
                    >
                        <img
                            alt=""
                            draggable={false}
                            height={140}
                            src={doorArt[color]}
                            width={120}
                        />
                        {state === 'locked' ? <span className="advent-door__frost" /> : null}
                        <span className="advent-door__number">{day}</span>
                        {state === 'locked' ? (
                            <Icon className="advent-door__lock" icon={SquareLock02Icon} size={12} />
                        ) : null}
                    </motion.span>
                ) : null}
            </DoorButton>
            <Tooltip.Content>
                <DoorTip day={day} entry={entry} state={state} />
            </Tooltip.Content>
        </Tooltip>
    );
}

/** What hovering a door says: an open door's fact, today's invitation, or when a locked one opens. */
function DoorTip({
    day,
    entry,
    state,
}: {
    day: number;
    entry: AdventEntry | null;
    state: DoorState;
}) {
    if (state === 'today-closed') {
        return (
            <>
                <p className="font-semibold">{`Dec ${day}`}</p>
                <p>Today’s door. Open it.</p>
            </>
        );
    }
    if (state === 'locked') {
        return (
            <>
                <p className="font-semibold">{`Dec ${day}`}</p>
                <p>{`Opens on December ${day}.`}</p>
            </>
        );
    }
    if (entry === null) {
        return <p className="font-semibold">{`Dec ${day}`}</p>;
    }
    return (
        <>
            <p className="font-semibold">{`Dec ${day} · ${entry.title}`}</p>
            <p>
                {entry.kind === 'recap' ? (
                    'Open for your year in Haus.'
                ) : (
                    <AdventLine runs={entry.line} />
                )}
            </p>
        </>
    );
}

const sparkleAngles = [23, 74, 126, 177, 229, 280, 332];

function Sparkles() {
    return sparkleAngles.map((angle) => (
        <span
            aria-hidden="true"
            className="advent-door__sparkle"
            key={angle}
            style={{ '--advent-sparkle-angle': `${angle}deg` } as React.CSSProperties}
        />
    ));
}

function doorLabel(day: number, state: DoorState, entry: AdventEntry | null) {
    if (state === 'today-closed') {
        return `December ${day}, today’s door`;
    }
    if (state === 'locked') {
        return `December ${day}, opens on December ${day}`;
    }
    return entry ? `December ${day}, ${entry.title}` : `December ${day}`;
}

const easeOutBack = [0.34, 1.56, 0.64, 1] as const;

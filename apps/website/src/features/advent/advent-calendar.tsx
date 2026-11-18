import type { AdventEntry } from '@haus/api';
import { useReducedMotion } from 'motion/react';
import * as React from 'react';
import { flushSync } from 'react-dom';
import {
    type AdventCalendarRead,
    useAdventCalendar,
} from '../../hooks/advent/use-advent-calendar.ts';
import { AdventDayCard, type AdventDayText } from './advent-day-card.tsx';
import { AdventDoor } from './advent-door.tsx';
import { type AdventSeason, adventDoors, doorState } from './advent-season.ts';
import { openAdventDay, useOpenedDays } from './use-opened-days.ts';
import './advent-calendar.css';

/** Today's card waits for the door's swing (0.5s) and the ornament's pop, in ms. */
const revealCardDelayMs = 950;

/**
 * The doors, today's door mid-reveal (the doors stay up but take no presses),
 * or one day's card, which takes the doors' place.
 */
type View =
    | { readonly kind: 'doors' }
    | { readonly day: number; readonly kind: 'revealing' }
    | { readonly day: number; readonly kind: 'card' };

/**
 * "Your year in Haus": 24 painted doors in a 6x4 grid, one fact a day.
 * Showing the calendar opens nothing; pressing today's door does, and once
 * the door has swung its card replaces the doors. Any open door shows its
 * card again; "See all days" brings the doors back with focus on that door.
 *
 * Doors render at once; the calendar read only fills their words, so a slow
 * or failed read never holds the doors back.
 */
export function AdventCalendar({ season, serverId }: { season: AdventSeason; serverId: string }) {
    const read = useAdventCalendar(serverId, season.year, season.today);
    const opened = useOpenedDays(serverId, season.year);
    const reducedMotion = useReducedMotion() === true;
    const [view, setView] = React.useState<View>({ kind: 'doors' });
    const [revealedDay, setRevealedDay] = React.useState<number | null>(null);
    const doorsRef = React.useRef<HTMLOListElement>(null);
    const revealTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // A reveal cut short by closing the dialog must not land on an unmounted calendar.
    React.useEffect(
        () => () => {
            if (revealTimer.current !== null) {
                clearTimeout(revealTimer.current);
            }
        },
        []
    );

    const openDoor = (day: number) => {
        const state = doorState(day, season.today, opened);
        if (state === 'locked' || view.kind !== 'doors') {
            return;
        }
        if (state === 'today-closed') {
            // Marked revealing in the same commit the door opens, so its swing animates.
            setRevealedDay(day);
            openAdventDay(serverId, season.year, day);
            if (!reducedMotion) {
                setView({ day, kind: 'revealing' });
                revealTimer.current = setTimeout(() => {
                    revealTimer.current = null;
                    setView({ day, kind: 'card' });
                }, revealCardDelayMs);
                return;
            }
        }
        setView({ day, kind: 'card' });
    };

    const showDoors = (day: number) => {
        // The doors come back in this commit, so the door can take focus back.
        flushSync(() => setView({ kind: 'doors' }));
        doorsRef.current?.querySelector<HTMLElement>(`[data-door="${day}"]`)?.focus();
    };

    return (
        <>
            {/* Hidden, not unmounted, while a card shows: the doors keep their opened state and
                today's door does not replay its reveal on the way back. */}
            <ol
                aria-label="Advent doors"
                className="grid grid-cols-6 gap-2"
                hidden={view.kind === 'card'}
                inert={view.kind === 'revealing'}
                ref={doorsRef}
            >
                {adventDoors.map((day) => (
                    <li key={day}>
                        <AdventDoor
                            day={day}
                            entry={entryFor(read, day)}
                            onOpen={openDoor}
                            revealing={day === revealedDay}
                            state={doorState(day, season.today, opened)}
                        />
                    </li>
                ))}
            </ol>
            {view.kind === 'card' ? (
                <AdventDayCard
                    day={view.day}
                    key={view.day}
                    onBack={() => showDoors(view.day)}
                    text={dayText(read, view.day)}
                />
            ) : null}
        </>
    );
}

function entryFor(read: AdventCalendarRead, day: number): AdventEntry | null {
    return read.status === 'success'
        ? (read.entries.find((entry) => entry.day === day) ?? null)
        : null;
}

function dayText(read: AdventCalendarRead, day: number): AdventDayText {
    if (read.status === 'pending') {
        return { kind: 'pending' };
    }
    const entry = entryFor(read, day);
    // A settled read without this day is as good as a failed one: no stats are invented.
    return entry ? { entry, kind: 'entry' } : { kind: 'failed' };
}

import * as React from 'react';
import { useResolvedThemeOptional } from '../../components/theme-provider.tsx';
import { useColorThemeDefinition } from '../../hooks/shell/use-color-theme.ts';
import { useLocalToday } from '../advent/local-today.ts';
import { type SleighFlight, startSleighFlight } from './flight.ts';
import {
    clearDebugSleigh,
    getSleighFlownOn,
    markSleighFlown,
    readDebugSleigh,
    useSleighFlownOn,
} from './flown-today.ts';
import { dayKey, departureHour, shouldArm } from './schedule.ts';

/**
 * Santa's team flying over the Inbox greeting: the nightcap ghost's sleigh,
 * four pairs of reindeer, and Rudolph in the lead, left to right across the
 * whole page in the air between the "Haus › Inbox" trail and the greeting,
 * about eight seconds. Only under a Christmas theme (`snowy-roofline`), once
 * a day, the first time the Inbox is shown after the theme's hour
 * (`schedule.ts`).
 *
 * Mount contract: the first child of the greeting's `position: relative`
 * header, inside the row that leads the page's scrolling column. The layer
 * reaches out from there to the scroller's width and top, so it is clipped to
 * the empty strip and covers no text or control. Pure art: no pointer events,
 * no focus, hidden from assistive tech.
 */
export function SleighRide(): React.ReactNode {
    const definition = useColorThemeDefinition();
    if (definition.scene !== 'snowy-roofline') {
        return null;
    }
    return <SleighRideSchedule departureHour={departureHour(definition)} />;
}

type Ride =
    | { readonly kind: 'idle' }
    | { readonly forced: boolean; readonly kind: 'armed' }
    | { readonly kind: 'flying' };

const idle: Ride = { kind: 'idle' };

function SleighRideSchedule({ departureHour: hour }: { departureHour: number }) {
    const today = dayKey(useLocalToday());
    const flownOn = useSleighFlownOn();
    const [ride, setRide] = React.useState<Ride>(idle);

    // Showing the Inbox is the trigger: this runs when the page mounts or its
    // tab is shown again, and on a new day or record.
    React.useEffect(() => {
        const forced = readDebugSleigh();
        const armed = shouldArm({
            departureHour: hour,
            flownOn,
            forced,
            hour: new Date().getHours(),
            reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            today,
        });
        if (armed) {
            setRide((current) => (current.kind === 'idle' ? { forced, kind: 'armed' } : current));
        }
    }, [flownOn, hour, today]);

    if (ride.kind === 'idle') {
        return null;
    }
    return (
        <SleighRideLayer
            mayDepart={() => ride.kind === 'armed' && (ride.forced || getSleighFlownOn() !== today)}
            onDepart={() => {
                setRide({ kind: 'flying' });
                markSleighFlown(today);
                clearDebugSleigh();
            }}
            onLand={() => setRide(idle)}
        />
    );
}

function SleighRideLayer({
    mayDepart,
    onDepart,
    onLand,
}: {
    mayDepart: () => boolean;
    onDepart: () => void;
    onLand: () => void;
}) {
    const dark = useResolvedThemeOptional() === 'dark';
    const layerRef = React.useRef<HTMLDivElement | null>(null);
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const flightRef = React.useRef<SleighFlight | null>(null);
    const handleMayDepart = React.useEffectEvent(mayDepart);
    const handleDepart = React.useEffectEvent(onDepart);
    const handleLand = React.useEffectEvent(onLand);

    // Runs the ride against the browser's frame clock, the strip's size, and focus.
    React.useEffect(() => {
        const layer = layerRef.current;
        const canvas = canvasRef.current;
        if (!(layer && canvas)) {
            return;
        }
        const flight = startSleighFlight(layer, canvas, {
            mayDepart: () => handleMayDepart(),
            onDepart: () => handleDepart(),
            onLand: () => handleLand(),
        });
        flightRef.current = flight;
        return () => {
            flight.stop();
            flightRef.current = null;
        };
    }, []);

    // Declared after the start effect, so on mount it hands the look to the
    // ride before its first frame.
    React.useEffect(() => {
        flightRef.current?.setDark(dark);
    }, [dark]);

    // The layer's box is measured (`strip.ts`); the canvas fills it below the page band.
    // `z-1` lifts it over the Inbox's top edge wash (z-index 1, earlier in the
    // frame), which would otherwise half-fade the team; the band (z-index 2)
    // still covers it once the page scrolls.
    return (
        <div
            aria-hidden="true"
            className="pointer-events-none absolute z-1 select-none"
            data-slot="sleigh-ride"
            ref={layerRef}
        >
            <canvas
                className="absolute top-[var(--app-shell-band-height)] left-0 block h-[calc(100%-var(--app-shell-band-height))] w-full"
                ref={canvasRef}
            />
        </div>
    );
}

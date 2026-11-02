import { loadTeamArt } from './art.ts';
import { drawTeam, type TeamArt } from './draw-team.ts';
import {
    advanceFlight,
    departureDelayMs,
    departureGate,
    type FlightClock,
    groundedClock,
    type WatchSignals,
} from './schedule.ts';
import { readStripRects, scrollParent, stripBox } from './strip.ts';
import { path, teamLength, teamPose } from './team.ts';

export interface FlightHandlers {
    /** Asked at the moment of departure; false lands the ride unflown (another window flew today). */
    mayDepart: () => boolean;
    onDepart: () => void;
    /** The ride is over, flown or not; the layer can go. */
    onLand: () => void;
}

export interface SleighFlight {
    setDark(dark: boolean): void;
    stop(): void;
}

/** Below this the strip is not the greeting's air (a squeezed layout): the team stays home. */
const minimumStripHeight = 24;

/**
 * Runs one armed ride over the Inbox greeting: waits until it can be watched
 * (`departureGate`), then flies the team left to right across the strip at
 * display rate, the gallop stepping at 8fps. Unfocused, hidden, or off screen
 * it freezes in place until it can be watched again; Reduce Motion lands it.
 *
 * `layer` is the ride's box inside the greeting header, sized to the strip;
 * `canvas` fills the part of it below the page band.
 */
export function startSleighFlight(
    layer: HTMLElement,
    canvas: HTMLCanvasElement,
    handlers: FlightHandlers
): SleighFlight {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const header = layer.parentElement;
    const row = header?.parentElement ?? null;
    const scroller = row ? scrollParent(row) : null;
    let dark = false;
    let art: TeamArt | null = null;
    let phase: 'flying' | 'landed' | 'waiting' = 'waiting';
    let clock: FlightClock = groundedClock;
    let onScreen = false;
    let size = { height: 0, scale: 1, width: 0 };
    let frame = 0;
    let delay: ReturnType<typeof setTimeout> | undefined;

    const signals = (): WatchSignals => ({
        focused: root.classList.contains('macos-electron')
            ? !root.classList.contains('window-blurred')
            : document.hasFocus(),
        onScreen,
        reducedMotion: reducedMotion.matches,
        visible: !document.hidden,
    });

    const land = () => {
        if (phase === 'landed') {
            return;
        }
        phase = 'landed';
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
        teardown();
        handlers.onLand();
    };

    const tick = (now: number) => {
        frame = 0;
        if (phase === 'waiting') {
            depart(now);
            return;
        }
        if (phase !== 'flying' || !art) {
            return;
        }
        const step = advanceFlight(clock, now, signals());
        clock = step.clock;
        if (step.mode === 'grounded') {
            land();
            return;
        }
        const length = teamLength();
        const x = -length - 4 + path.speed * clock.elapsed;
        if (x > size.width + 4) {
            land();
            return;
        }
        paint(x);
        if (step.mode === 'running') {
            request();
        }
    };

    const depart = (now: number) => {
        const sinceLoadMs = performance.now();
        const gate = departureGate({
            ...signals(),
            atTop: (scroller?.scrollTop ?? 0) <= 0.5,
            ready: art !== null && size.height >= minimumStripHeight,
            sinceLoadMs,
        });
        if (gate === 'abort') {
            land();
            return;
        }
        if (gate === 'wait') {
            // The one gate no event announces: the window's first second.
            if (sinceLoadMs < departureDelayMs && delay === undefined) {
                delay = setTimeout(() => {
                    delay = undefined;
                    wake();
                }, departureDelayMs - sinceLoadMs);
            }
            return;
        }
        if (!handlers.mayDepart()) {
            land();
            return;
        }
        phase = 'flying';
        clock = { elapsed: 0, lastTick: now };
        handlers.onDepart();
        tick(now);
    };

    const paint = (x: number) => {
        const context = canvas.getContext('2d');
        if (!(context && art)) {
            return;
        }
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.setTransform(size.scale, 0, 0, size.scale, 0, 0);
        context.imageSmoothingQuality = 'high';
        drawTeam(context, teamPose(clock.elapsed, x, size.height / 2), art, dark);
    };

    const measure = () => {
        const rects = header ? readStripRects(header) : null;
        if (!rects) {
            land();
            return;
        }
        const box = stripBox(rects);
        layer.style.left = `${box.left}px`;
        layer.style.top = `${box.top}px`;
        layer.style.width = `${box.width}px`;
        layer.style.height = `${box.height}px`;
        const scale = window.devicePixelRatio || 1;
        size = { height: canvas.clientHeight, scale, width: canvas.clientWidth };
        canvas.width = Math.round(size.width * scale);
        canvas.height = Math.round(size.height * scale);
        // Resizing clears the canvas; a held ride repaints where it froze.
        wake();
    };

    function request() {
        frame ||= requestAnimationFrame(tick);
    }
    function wake() {
        if (phase !== 'landed') {
            request();
        }
    }

    const resizeObserver = new ResizeObserver(measure);
    const intersectionObserver = new IntersectionObserver((entries) => {
        onScreen = entries.at(-1)?.isIntersecting ?? onScreen;
        wake();
    });
    // `window-blurred` on the root is the desktop's focus signal.
    const classObserver = new MutationObserver(wake);
    const teardown = () => {
        clearTimeout(delay);
        cancelAnimationFrame(frame);
        frame = 0;
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        classObserver.disconnect();
        scroller?.removeEventListener('scroll', wake);
        document.removeEventListener('visibilitychange', wake);
        window.removeEventListener('focus', wake);
        window.removeEventListener('blur', wake);
        reducedMotion.removeEventListener('change', wake);
    };

    if (!(header && row && scroller)) {
        land();
        return { setDark: () => undefined, stop: () => undefined };
    }
    for (const element of [header, row, scroller]) {
        resizeObserver.observe(element);
    }
    intersectionObserver.observe(canvas);
    classObserver.observe(root, { attributeFilter: ['class'] });
    scroller.addEventListener('scroll', wake, { passive: true });
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('blur', wake);
    reducedMotion.addEventListener('change', wake);
    loadTeamArt().then((loaded) => {
        if (phase === 'landed') {
            return;
        }
        if (!loaded) {
            land();
            return;
        }
        art = loaded;
        wake();
    });

    return {
        setDark(next) {
            dark = next;
            wake();
        },
        stop() {
            // Unmounting is not landing: the owner is already gone.
            phase = 'landed';
            teardown();
        },
    };
}

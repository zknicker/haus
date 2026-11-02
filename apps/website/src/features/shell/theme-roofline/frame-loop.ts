/**
 * 12.5fps. Flakes fall at most 7.5px a second and a bulb swells over 3.4s,
 * so nothing moves more than 0.6px between frames, inside the 10-15fps
 * budget the Halloween sky set.
 */
export const frameMs = 80;
/** Where the clock starts; also the one frame shown under reduced motion. */
export const clockStart = 600;

/**
 * What a frame is: `running` advances the clock, `held` redraws the held clock
 * (unfocused), and `still` is the one reduced-motion frame.
 */
export type FrameMode = 'running' | 'held' | 'still';

export interface FrameLoop {
    stop(): void;
    /** Something changed (a size, the look, art that loaded): draw one frame now. */
    wake(): void;
}

export interface FrameGates {
    /** While true, running frames come every display frame instead of every `frameMs`. */
    displayRate: () => boolean;
    /** Gates every draw on the caller's own state (a measured size). */
    ready: () => boolean;
}

/**
 * Calls `draw(time, mode)` with a clock in seconds, at most every `frameMs`
 * (or every display frame while `displayRate` asks), while `target` is on
 * screen, the document is visible, and the window has focus. Otherwise it
 * holds its last frame and its clock, so nothing jumps when it resumes; `wake`
 * still redraws that held frame (a resize while blurred).
 * `prefers-reduced-motion` gets one static frame at `clockStart`.
 */
export function startFrameLoop(
    target: Element,
    draw: (time: number, mode: FrameMode) => void,
    { displayRate, ready }: FrameGates
): FrameLoop {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let onScreen = true;
    let clock = clockStart;
    let lastTick = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;

    const blurred = () =>
        root.classList.contains('macos-electron')
            ? root.classList.contains('window-blurred')
            : !document.hasFocus();
    const drawable = () => onScreen && !document.hidden && ready();
    const animating = () => drawable() && !reducedMotion.matches && !blurred();

    const tick = (now: number) => {
        frame = 0;
        if (!drawable()) {
            lastTick = 0;
            return;
        }
        const running = animating();
        if (running) {
            // Advance only while running, and never by more than a beat.
            clock += lastTick === 0 ? 0 : Math.min(now - lastTick, 250) / 1000;
            lastTick = now;
        } else {
            lastTick = 0;
        }
        if (reducedMotion.matches) {
            draw(clockStart, 'still');
        } else {
            draw(clock, running ? 'running' : 'held');
        }
        if (!animating()) {
            return;
        }
        if (displayRate()) {
            request();
        } else {
            timer = setTimeout(request, Math.max(0, frameMs - (performance.now() - now)));
        }
    };
    function request() {
        timer = undefined;
        frame ||= requestAnimationFrame(tick);
    }
    const wake = () => {
        clearTimeout(timer);
        timer = undefined;
        request();
    };

    const intersectionObserver = new IntersectionObserver((entries) => {
        onScreen = entries.at(-1)?.isIntersecting ?? onScreen;
        wake();
    });
    // `window-blurred` on the root is the desktop's focus signal.
    const classObserver = new MutationObserver(wake);
    intersectionObserver.observe(target);
    classObserver.observe(root, { attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('blur', wake);
    reducedMotion.addEventListener('change', wake);
    wake();

    return {
        stop() {
            clearTimeout(timer);
            cancelAnimationFrame(frame);
            intersectionObserver.disconnect();
            classObserver.disconnect();
            document.removeEventListener('visibilitychange', wake);
            window.removeEventListener('focus', wake);
            window.removeEventListener('blur', wake);
            reducedMotion.removeEventListener('change', wake);
        },
        wake,
    };
}

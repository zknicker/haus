/**
 * 12.5fps. Flakes fall at most 7.5px a second and a bulb swells over 3.4s,
 * so nothing moves more than 0.6px between frames, inside the 10-15fps
 * budget the Halloween sky set.
 */
export const frameMs = 80;
/** Where the clock starts; also the one frame shown under reduced motion. */
export const clockStart = 600;

export interface FrameLoop {
    stop(): void;
    /** Something changed (a size, the look, art that loaded): draw one frame now. */
    wake(): void;
}

/**
 * Calls `draw(time)` with a clock in seconds, at most every `frameMs`, while
 * `target` is on screen, the document is visible, and the window has focus.
 * Otherwise it holds its last frame and its clock, so nothing jumps when it
 * resumes; `wake` still redraws that held frame (a resize while blurred).
 * `prefers-reduced-motion` gets one static frame at `clockStart`.
 *
 * `ready` gates every draw on the caller's own state (a measured size).
 */
export function startFrameLoop(
    target: Element,
    draw: (time: number) => void,
    ready: () => boolean
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
        if (animating()) {
            // Advance only while running, and never by more than a beat.
            clock += lastTick === 0 ? 0 : Math.min(now - lastTick, 250) / 1000;
            lastTick = now;
        } else {
            lastTick = 0;
        }
        draw(reducedMotion.matches ? clockStart : clock);
        if (animating()) {
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

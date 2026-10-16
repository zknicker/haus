import { createSkyRenderer, type SkyRenderer } from './halloween-sky-gl.ts';

/**
 * Where the moon sits in a sky placement, in CSS px: `inset` from the trailing
 * edge (it stays clear of the controls there), `y` from the top.
 */
export interface SkyMoonLayout {
    inset: number;
    radius: number;
    y: number;
}

/**
 * The drift is a few px per minute, so 10fps is far more than the motion
 * needs and well under the 15fps budget.
 */
const frameMs = 100;
/** Backing px per device px: the clouds are soft, so half resolution holds up. */
const resolution = 0.5;
/** Where the sky's clock starts; also the one frame shown under reduced motion. */
const clockStart = 600;

/**
 * Runs the sky on `canvas` until the returned stop function is called, or
 * returns `null` when WebGL is unavailable (the caller renders nothing).
 *
 * It draws only while the canvas is on screen, the document is visible, and
 * the window has focus; otherwise it holds its last frame and its clock, so
 * the clouds never jump when it resumes. `prefers-reduced-motion` gets one
 * static frame, redrawn only when the canvas resizes.
 */
export function startSkyLoop(canvas: HTMLCanvasElement, moon: SkyMoonLayout): (() => void) | null {
    const initial = createSkyRenderer(canvas);
    if (!initial) {
        return null;
    }
    let renderer: SkyRenderer = initial;
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    let onScreen = true;
    let lost = false;
    let clock = clockStart;
    let lastTick = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;

    const blurred = () =>
        root.classList.contains('macos-electron')
            ? root.classList.contains('window-blurred')
            : !document.hasFocus();
    const drawable = () => !lost && onScreen && !document.hidden && width > 0 && height > 0;
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
        renderer.draw({
            height,
            moon: { radius: moon.radius, x: width - moon.inset, y: moon.y },
            scale: Math.max(1, window.devicePixelRatio * resolution),
            time: reducedMotion.matches ? clockStart : clock,
            width,
        });
        if (animating()) {
            timer = setTimeout(request, Math.max(0, frameMs - (performance.now() - now)));
        }
    };
    function request() {
        timer = undefined;
        frame ||= requestAnimationFrame(tick);
    }
    // Something changed (size, visibility, focus, motion preference): draw now.
    const wake = () => {
        clearTimeout(timer);
        timer = undefined;
        request();
    };

    const resizeObserver = new ResizeObserver(([entry]) => {
        width = entry?.contentRect.width ?? width;
        height = entry?.contentRect.height ?? height;
        wake();
    });
    const intersectionObserver = new IntersectionObserver((entries) => {
        onScreen = entries.at(-1)?.isIntersecting ?? onScreen;
        wake();
    });
    const classObserver = new MutationObserver(wake);
    // A GPU reset or sleep can drop the context; asking for the restore and
    // rebuilding the program on it keeps the sky from going blank for good.
    const onContextLost = (event: Event) => {
        event.preventDefault();
        lost = true;
    };
    const onContextRestored = () => {
        const restored = createSkyRenderer(canvas);
        if (restored) {
            renderer = restored;
            lost = false;
            wake();
        }
    };
    resizeObserver.observe(canvas);
    intersectionObserver.observe(canvas);
    classObserver.observe(root, { attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('blur', wake);
    reducedMotion.addEventListener('change', wake);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    wake();

    return () => {
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        classObserver.disconnect();
        document.removeEventListener('visibilitychange', wake);
        window.removeEventListener('focus', wake);
        window.removeEventListener('blur', wake);
        reducedMotion.removeEventListener('change', wake);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextrestored', onContextRestored);
        renderer.dispose();
    };
}

import * as React from 'react';

/** Zoom stops past fit, as fractions of the image's own pixels. */
const zoomStops = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const;
const maxZoom = 4;

export interface ImageSize {
    height: number;
    width: number;
}

/**
 * The scale at which an image fits a stage, never above its own size: a small
 * image shows pixel for pixel, a 4500×5400 print shrinks to fit.
 */
export function fitScale(image: ImageSize | null, stage: ImageSize | null): number {
    if (!(image && stage) || image.width <= 0 || image.height <= 0) {
        return 1;
    }
    return Math.min(1, stage.width / image.width, stage.height / image.height);
}

/** The next stop above `scale`, or null at the top. */
export function zoomInFrom(scale: number): number | null {
    return zoomStops.find((stop) => stop > scale + 1e-6) ?? null;
}

/** The next stop below `scale`; null when that would fall to or under fit. */
export function zoomOutFrom(scale: number, fit: number): number | null {
    const stop = [...zoomStops].reverse().find((entry) => entry < scale - 1e-6);
    return stop === undefined || stop <= fit + 1e-6 ? null : stop;
}

/**
 * The zoom viewer's scale against the image's real pixels: `fit` until the
 * viewer zooms, and the label always says the true scale (a fitted print reads
 * 14%, not 100%). Measures the stage so fit tracks the window.
 */
export function useLightboxZoom(image: ImageSize | null, resetKey: unknown) {
    const [zoom, setZoom] = React.useState<number | 'fit'>('fit');
    const [stage, setStage] = React.useState<ImageSize | null>(null);
    const observer = React.useRef<ResizeObserver | null>(null);
    // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey names the image shown.
    React.useEffect(() => setZoom('fit'), [resetKey]);
    const stageRef = React.useCallback((element: HTMLElement | null) => {
        observer.current?.disconnect();
        if (!element) {
            return;
        }
        observer.current = new ResizeObserver(([entry]) => {
            if (entry) {
                setStage({ height: entry.contentRect.height, width: entry.contentRect.width });
            }
        });
        observer.current.observe(element);
    }, []);
    const fit = fitScale(image, stage);
    const scale = zoom === 'fit' ? fit : zoom;
    const zoomIn = zoomInFrom(scale);
    const zoomOut = zoom === 'fit' ? null : (zoomOutFrom(scale, fit) ?? 'fit');
    return {
        canZoomIn: zoomIn !== null && scale < maxZoom,
        canZoomOut: zoomOut !== null,
        isFit: zoom === 'fit',
        label: `${Math.round(scale * 100)}%`,
        scale,
        stageRef,
        zoomIn: () => zoomIn !== null && setZoom(zoomIn),
        zoomOut: () => zoomOut !== null && setZoom(zoomOut),
    };
}

import {
    ArrowLeft01Icon,
    ArrowRight01Icon,
    Cancel01Icon,
    Download01Icon,
    MinusSignIcon,
    PlusSignIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { cn } from '../../lib/utils.ts';
import { Icon } from '../ui/icon.tsx';

interface ImageLightboxProps {
    dataUrl: string;
    /** A side panel of facts about the image (its prompt, model, cost); stacks under the image on a narrow screen. */
    details?: React.ReactNode;
    download:
        | { filename: string; kind: 'link' }
        | { disabled: boolean; kind: 'action'; onDownload: () => void };
    filename: string;
    height?: number | null;
    /** Steps through the other images of the same message; a missing side has nothing there. */
    navigation?: { onNext?: () => void; onPrevious?: () => void };
    onOpenChange: (open: boolean) => void;
    open: boolean;
    width?: number | null;
}

/**
 * Full-screen image viewer with zoom and download. A bespoke overlay, not a
 * Modal skin: it composes react-aria-components directly (the same
 * foundation HeroUI uses) for the focus trap and dismissal, and owns all of
 * its viewer chrome.
 */
export function ImageLightbox({
    dataUrl,
    details,
    download,
    filename,
    height,
    navigation,
    onOpenChange,
    open,
    width,
}: ImageLightboxProps) {
    const [zoom, setZoom] = React.useState(1);
    const [intrinsicSize, setIntrinsicSize] = React.useState<{
        height: number;
        width: number;
    } | null>(null);
    const renderWidth = width ?? intrinsicSize?.width;
    const renderHeight = height ?? intrinsicSize?.height;
    const isFitZoom = zoom === 1;
    const zoomPercent = `${Math.round(zoom * 100)}%`;
    const scaledHeight = renderHeight ? Math.round(renderHeight * zoom) : undefined;
    const scaledWidth = renderWidth ? Math.round(renderWidth * zoom) : undefined;

    // Each image opens at fit, including one reached by stepping.
    // biome-ignore lint/correctness/useExhaustiveDependencies: dataUrl names the image shown.
    React.useEffect(() => {
        if (open) {
            setZoom(1);
        }
    }, [dataUrl, open]);

    useArrowKeySteps(open ? navigation : undefined);

    React.useEffect(() => {
        const image = new Image();
        const updateIntrinsicSize = () => {
            setIntrinsicSize({ height: image.naturalHeight, width: image.naturalWidth });
        };
        image.addEventListener('load', updateIntrinsicSize);
        image.src = dataUrl;
        return () => image.removeEventListener('load', updateIntrinsicSize);
    }, [dataUrl]);

    return (
        <ModalOverlay
            className="data-entering:fade-in data-exiting:fade-out fixed inset-0 z-50 bg-black/76 backdrop-blur-md data-entering:animate-in data-exiting:animate-out"
            isDismissable
            isOpen={open}
            onOpenChange={onOpenChange}
        >
            <Modal className="data-entering:fade-in data-exiting:fade-out data-entering:zoom-in-95 data-exiting:zoom-out-95 fixed inset-0 z-50 data-entering:animate-in data-exiting:animate-out">
                <Dialog
                    aria-label={filename}
                    className="flex h-dvh flex-col text-white outline-none"
                >
                    {/* The header owns the actions, so nothing below ever tucks under them. */}
                    <div className="flex h-16 shrink-0 items-center gap-3 pr-4 pl-24">
                        <p className="min-w-0 flex-1 truncate text-sm text-white/75">{filename}</p>
                        <ImageLightboxDownload
                            dataUrl={dataUrl}
                            download={download}
                            filename={filename}
                        />
                        <button
                            aria-label="Close image viewer"
                            className={imageViewerActionButtonClassName}
                            onClick={() => onOpenChange(false)}
                            type="button"
                        >
                            <Icon icon={Cancel01Icon} size={24} strokeWidth={2} />
                        </button>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                        <div className="relative flex min-h-0 min-w-0 flex-1">
                            <div className="min-h-0 flex-1 overflow-auto px-20 pt-2 pb-24">
                                <div
                                    className={cn(
                                        'relative flex items-center justify-center',
                                        isFitZoom ? 'size-full' : 'min-h-full min-w-full'
                                    )}
                                >
                                    <button
                                        aria-hidden="true"
                                        className="absolute inset-0 cursor-zoom-out"
                                        onClick={() => onOpenChange(false)}
                                        tabIndex={-1}
                                        type="button"
                                    />
                                    {/* At fit the picture scales down to the stage, whole and
                                        undistorted; zoomed, it takes its scaled pixel size and scrolls. */}
                                    <img
                                        alt=""
                                        className={cn(
                                            'relative z-10 cursor-default rounded-md object-contain shadow-2xl shadow-black/55',
                                            isFitZoom
                                                ? 'h-auto max-h-full w-auto max-w-full'
                                                : 'max-w-none'
                                        )}
                                        height={isFitZoom ? undefined : scaledHeight}
                                        src={dataUrl}
                                        width={isFitZoom ? undefined : scaledWidth}
                                    />
                                </div>
                            </div>
                            {navigation ? <ImageLightboxSteps navigation={navigation} /> : null}
                            <ImageZoomControls
                                onZoomIn={() => setZoom((value) => Math.min(4, value + 0.25))}
                                onZoomOut={() => setZoom((value) => Math.max(1, value - 0.25))}
                                zoom={zoom}
                                zoomLabel={zoomPercent}
                            />
                        </div>
                        {details ? (
                            <aside className="z-20 mx-4 mb-4 max-h-[40%] shrink-0 overflow-auto rounded-2xl bg-surface p-5 text-foreground md:mt-2 md:mb-6 md:max-h-none md:w-80 md:self-start">
                                {details}
                            </aside>
                        ) : null}
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

function ImageLightboxDownload({
    dataUrl,
    download,
    filename,
}: Pick<ImageLightboxProps, 'dataUrl' | 'download' | 'filename'>) {
    const content = (
        <>
            <Icon icon={Download01Icon} size={24} strokeWidth={2} />
            <span className="sr-only">Download {filename}</span>
        </>
    );

    return download.kind === 'link' ? (
        <a
            aria-label={`Download ${filename}`}
            className={imageViewerActionButtonClassName}
            download={download.filename}
            href={dataUrl}
        >
            {content}
        </a>
    ) : (
        <button
            aria-label={`Download ${filename}`}
            className={imageViewerActionButtonClassName}
            disabled={download.disabled}
            onClick={download.onDownload}
            type="button"
        >
            {content}
        </button>
    );
}

/** Left and Right step while the viewer is open; react-aria's Dialog takes no key handler. */
function useArrowKeySteps(navigation: ImageLightboxProps['navigation']) {
    const onPrevious = navigation?.onPrevious;
    const onNext = navigation?.onNext;
    React.useEffect(() => {
        if (!(onPrevious || onNext)) {
            return;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            const step =
                event.key === 'ArrowLeft'
                    ? onPrevious
                    : event.key === 'ArrowRight'
                      ? onNext
                      : undefined;
            if (step && !event.defaultPrevented) {
                event.preventDefault();
                step();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onNext, onPrevious]);
}

/** Previous and Next sit on the stage's edges, clear of the details panel beside it. */
function ImageLightboxSteps({
    navigation,
}: {
    navigation: NonNullable<ImageLightboxProps['navigation']>;
}) {
    // aria-disabled, not disabled: stepping onto the last image must not drop
    // focus from the button the user just pressed, or Escape stops reaching the dialog.
    return (
        <>
            <button
                aria-disabled={!navigation.onPrevious || undefined}
                aria-label="Previous image"
                className={cn(
                    imageViewerActionButtonClassName,
                    'absolute top-1/2 left-4 z-20 -translate-y-1/2'
                )}
                onClick={navigation.onPrevious}
                type="button"
            >
                <Icon icon={ArrowLeft01Icon} size={24} strokeWidth={2} />
            </button>
            <button
                aria-disabled={!navigation.onNext || undefined}
                aria-label="Next image"
                className={cn(
                    imageViewerActionButtonClassName,
                    'absolute top-1/2 right-4 z-20 -translate-y-1/2'
                )}
                onClick={navigation.onNext}
                type="button"
            >
                <Icon icon={ArrowRight01Icon} size={24} strokeWidth={2} />
            </button>
        </>
    );
}

const imageViewerActionButtonClassName =
    'inline-flex shrink-0 size-11 items-center justify-center rounded-full bg-white text-neutral-950 shadow-black/20 shadow-lg hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-default disabled:opacity-40 aria-disabled:cursor-default aria-disabled:opacity-40';

function ImageZoomControls({
    onZoomIn,
    onZoomOut,
    zoom,
    zoomLabel,
}: {
    onZoomIn: () => void;
    onZoomOut: () => void;
    zoom: number;
    zoomLabel: string;
}) {
    return (
        <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center rounded-full border border-white/15 bg-white text-neutral-950 shadow-black/20 shadow-lg">
            <button
                aria-label="Zoom out"
                className="inline-flex size-10 items-center justify-center rounded-l-full hover:bg-neutral-100 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
                disabled={zoom <= 1}
                onClick={onZoomOut}
                type="button"
            >
                <Icon icon={MinusSignIcon} size={18} strokeWidth={2} />
            </button>
            <div className="min-w-16 border-neutral-200 border-x px-3 text-center font-medium text-sm tabular-nums">
                {zoomLabel}
            </div>
            <button
                aria-label="Zoom in"
                className="inline-flex size-10 items-center justify-center rounded-r-full hover:bg-neutral-100 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
                disabled={zoom >= 4}
                onClick={onZoomIn}
                type="button"
            >
                <Icon icon={PlusSignIcon} size={18} strokeWidth={2} />
            </button>
        </div>
    );
}

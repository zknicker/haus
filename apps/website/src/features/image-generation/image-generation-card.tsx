import type { ImageGeneration } from '@haus/api';
import { Label, Skeleton } from '@heroui/react';
import { ContextMenu, TextShimmer } from '@heroui-pro/react';
import { AlertCircleIcon, Download04Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useReducedMotion } from 'framer-motion';
import type * as React from 'react';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useAttachmentImage } from '../../hooks/servers/use-attachment-image.ts';
import { useImageGenerationDownload } from '../../hooks/servers/use-image-generation-download.ts';
import { cn } from '../../lib/utils.ts';
import {
    type ImageGenerationFooter,
    imageGenerationAspect,
    imageGenerationFooter,
    imageGenerationLabel,
} from './image-generation-presentation.ts';

export type ImageGenerationCardLayout = 'solo' | 'strip';

/**
 * One generation as one card at its link: the picture and a two-line footer
 * inside a single bordered surface. The picture holds the generation's own
 * aspect ratio in every state, so a card never reflows when its bytes land.
 * A lone card is bounded by a max width and a max picture height; in a strip
 * every card shares one picture-row height and takes its width from its own
 * aspect, clamped, so a tall image never dominates and a wide one never
 * overflows (specs/image-generation.md, Cards).
 */
export function ImageGenerationCard({
    generation,
    layout,
    onOpen,
    serverId,
}: {
    generation: ImageGeneration;
    layout: ImageGenerationCardLayout;
    /** Opens the viewer; only a ready card has a picture to open. */
    onOpen: () => void;
    serverId: string;
}) {
    return (
        <figure
            aria-label={imageGenerationLabel(generation)}
            className={cn(
                'card-shell m-0 flex min-w-0 flex-col overflow-hidden border border-separator bg-nested-surface',
                layout === 'solo'
                    ? 'w-[min(100%,22rem,calc(20rem*var(--ar)))]'
                    : 'w-[clamp(8.5rem,calc(10rem*var(--ar)),18rem)] shrink-0 snap-start max-sm:w-[clamp(7.5rem,calc(8.5rem*var(--ar)),15rem)]'
            )}
            data-slot="image-generation-card"
            data-state={generation.result.state}
            style={{ '--ar': imageGenerationAspect(generation) } as React.CSSProperties}
        >
            <div
                className={cn(
                    'grid place-items-center border-separator border-b',
                    layout === 'strip' && 'h-40 max-sm:h-34'
                )}
            >
                <div
                    className={cn(
                        'relative aspect-(--ar) overflow-hidden bg-surface-secondary',
                        layout === 'solo'
                            ? 'w-full'
                            : 'w-[min(100%,calc(10rem*var(--ar)))] max-sm:w-[min(100%,calc(8.5rem*var(--ar)))]'
                    )}
                >
                    <GenerationPicture
                        generation={generation}
                        onOpen={onOpen}
                        serverId={serverId}
                    />
                </div>
            </div>
            <GenerationFooter generation={generation} />
        </figure>
    );
}

function GenerationPicture({
    generation,
    onOpen,
    serverId,
}: {
    generation: ImageGeneration;
    onOpen: () => void;
    serverId: string;
}) {
    const { result } = generation;
    switch (result.state) {
        case 'pending':
        case 'generating':
            return <PendingPicture />;
        case 'ready':
            return (
                <ReadyPicture
                    attachmentId={result.attachmentId}
                    generation={generation}
                    onOpen={onOpen}
                    serverId={serverId}
                />
            );
        case 'failed':
            return <FailedPicture reason={result.reason} />;
        default:
            return null;
    }
}

/** A blank box at the requested aspect with a slow sweep; motion yields to reduced motion. */
function PendingPicture() {
    const reduceMotion = useReducedMotion();
    return (
        <>
            <Skeleton
                animationType={reduceMotion ? 'none' : 'shimmer'}
                className="absolute inset-0 rounded-none"
            />
            <span className="sr-only">Generating image</span>
        </>
    );
}

function FailedPicture({ reason }: { reason: string }) {
    return (
        <div
            className="absolute inset-0 flex flex-col justify-end gap-0.5 overflow-hidden bg-danger-soft p-2.5"
            role="img"
        >
            <Icon
                aria-hidden="true"
                className="absolute top-2.5 left-2.5 text-danger"
                icon={AlertCircleIcon}
                size={18}
            />
            <strong className="font-semibold text-danger text-xs leading-snug">
                Generation failed
            </strong>
            <span className="line-clamp-4 text-muted text-xs leading-snug">{reason}</span>
        </div>
    );
}

function ReadyPicture({
    attachmentId,
    generation,
    onOpen,
    serverId,
}: {
    attachmentId: string;
    generation: ImageGeneration;
    onOpen: () => void;
    serverId: string;
}) {
    const loaded = useAttachmentImage({ attachmentId, kind: 'hosted', serverId });
    const download = useImageGenerationDownload(serverId);

    if (loaded.failed) {
        return (
            <p className="absolute inset-0 grid place-items-center p-2 text-center text-muted text-xs">
                Image unavailable
            </p>
        );
    }
    if (!loaded.image) {
        return null;
    }
    return (
        <ContextMenu>
            <ContextMenu.Trigger className="absolute inset-0">
                <button
                    aria-label={`Open ${generation.modelDisplayName} image`}
                    className="block size-full cursor-zoom-in"
                    onClick={onOpen}
                    type="button"
                >
                    <img
                        alt=""
                        className="size-full object-contain"
                        height={loaded.image.height}
                        src={loaded.image.url}
                        width={loaded.image.width}
                    />
                </button>
            </ContextMenu.Trigger>
            <ContextMenu.Popover>
                <ContextMenu.Menu onAction={() => download.mutate(generation)}>
                    <ContextMenu.Item
                        id="save-image-as"
                        isDisabled={download.isPending}
                        textValue="Save Image As"
                    >
                        <Icon className="size-4 text-muted" icon={Download04Icon} />
                        <Label>Save Image As…</Label>
                    </ContextMenu.Item>
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu>
    );
}

function GenerationFooter({ generation }: { generation: ImageGeneration }) {
    const live = generation.result.state === 'pending' || generation.result.state === 'generating';
    return live ? (
        <LiveFooter generation={generation} />
    ) : (
        <FooterLines footer={imageGenerationFooter(generation, 0)} />
    );
}

/** Ticks once a second while the generation runs, and only then. */
function LiveFooter({ generation }: { generation: ImageGeneration }) {
    const now = useRelativeNow(1000);
    return <FooterLines footer={imageGenerationFooter(generation, now)} />;
}

function FooterLines({ footer }: { footer: ImageGenerationFooter }) {
    return (
        <figcaption className="flex min-w-0 flex-col px-2.5 py-1.5 text-xs tabular-nums leading-snug">
            <span className="truncate font-medium text-foreground">{footer.model}</span>
            <span
                className={cn('truncate', footer.tone === 'danger' ? 'text-danger' : 'text-muted')}
            >
                {footer.status ? (
                    <>
                        {footer.live ? (
                            <TextShimmer>{footer.status}</TextShimmer>
                        ) : (
                            <span className="font-medium">{footer.status}</span>
                        )}
                        {' · '}
                    </>
                ) : null}
                {footer.facts}
            </span>
        </figcaption>
    );
}

import type { ImageGeneration } from '@haus/api';
import { Chip, Label, Skeleton, Tooltip } from '@heroui/react';
import { ContextMenu, TextShimmer } from '@heroui-pro/react';
import { Download04Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useReducedMotion } from 'framer-motion';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useAttachmentImage } from '../../hooks/servers/use-attachment-image.ts';
import { useImageGenerationDownload } from '../../hooks/servers/use-image-generation-download.ts';
import { cn } from '../../lib/utils.ts';
import {
    type ImageGenerationFooter,
    imageGenerationFooter,
    imageGenerationLabel,
} from './image-generation-presentation.ts';

/**
 * One generation as one card at its link: the chat media tile box (the same
 * `--chat-media-tile-*` 4:3 box and `rounded-xl` corner as attachment tiles)
 * with a two-line footer attached as one unit. The box is the same in every
 * state and in a lone card or a strip, so nothing reflows when bytes land or
 * one render fails beside three that worked; the image crops to it and the
 * viewer shows the whole picture (specs/image-generation.md, Cards).
 */
export function ImageGenerationCard({
    generation,
    onOpen,
    serverId,
}: {
    generation: ImageGeneration;
    /** Opens the viewer; only a ready card has a picture to open. */
    onOpen: () => void;
    serverId: string;
}) {
    return (
        <figure
            aria-label={imageGenerationLabel(generation)}
            className="m-0 flex w-(--chat-media-tile-width) shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border bg-nested-surface"
            data-slot="image-generation-card"
            data-state={generation.result.state}
        >
            <div
                className={cn(
                    'relative h-(--chat-media-tile-height) w-full overflow-hidden bg-surface-secondary'
                )}
            >
                <GenerationPicture generation={generation} onOpen={onOpen} serverId={serverId} />
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
            return <FailedPicture prompt={generation.prompt} reason={result.reason} />;
        default:
            return null;
    }
}

/** The neutral box with a slow sweep; motion yields to reduced motion. */
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

/**
 * The pending tile's neutral surface with a soft danger chip and the prompt
 * as a fading muted ghost. The reason is on hover and in the accessible name.
 */
function FailedPicture({ prompt, reason }: { prompt: string; reason: string }) {
    return (
        <Tooltip>
            <Tooltip.Trigger>
                <div
                    aria-label={`Couldn't generate: ${reason}`}
                    className="absolute inset-0 flex flex-col items-start gap-1.5 p-2.5"
                    role="img"
                >
                    <Chip color="danger" size="sm" variant="soft">
                        Failed
                    </Chip>
                    <p className="mask-[linear-gradient(to_bottom,black_55%,transparent)] line-clamp-5 min-h-0 text-left text-muted text-xs italic">
                        {prompt}
                    </p>
                </div>
            </Tooltip.Trigger>
            <Tooltip.Content className="max-w-72">{reason}</Tooltip.Content>
        </Tooltip>
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
                        className="size-full object-cover"
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
            <span className="truncate text-muted">
                {footer.status ? (
                    <>
                        <TextShimmer>{footer.status}</TextShimmer>
                        {' · '}
                    </>
                ) : null}
                {footer.facts}
            </span>
        </figcaption>
    );
}

import type { ImageGeneration } from '@haus/api';
import { Chip, Label, Skeleton, Tooltip } from '@heroui/react';
import { ContextMenu, TextShimmer } from '@heroui-pro/react';
import { Download04Icon } from '@hugeicons-pro/core-stroke-rounded';
import { motion, useReducedMotion } from 'motion/react';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useAttachmentImage } from '../../hooks/servers/use-attachment-image.ts';
import { useImageGenerationDownload } from '../../hooks/servers/use-image-generation-download.ts';
import { useSecondClock } from '../../hooks/time/use-second-clock.ts';
import { imageGenerationEntrance, imageGenerationReveal } from './image-generation-motion.ts';
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
    index = 0,
    onOpen,
    serverId,
}: {
    generation: ImageGeneration;
    /** Position among the Message's cards, across strips; staggers the entrance. */
    index?: number;
    /** Opens the viewer; only a ready card has a picture to open. */
    onOpen: () => void;
    serverId: string;
}) {
    const reduceMotion = useReducedMotion();
    const { state } = generation.result;
    const live = state === 'pending' || state === 'generating';
    // Only a card for a running job arrives with motion; history and chat
    // switches render settled cards in place.
    const [arrivedLive] = React.useState(live);
    // One shimmer instance spans pending, generating, and the decode after
    // ready, so its sweep never restarts or blinks out before the image shows.
    const [revealed, setRevealed] = React.useState(false);
    const reveal = React.useCallback(() => setRevealed(true), []);
    const shimmer = live || (state === 'ready' && !revealed);
    const entrance = arrivedLive ? imageGenerationEntrance(index, reduceMotion) : null;
    const painted = usePaintedOnce(entrance !== null);

    return (
        <motion.figure
            animate={entrance ? (painted ? entrance.animate : entrance.initial) : undefined}
            aria-label={imageGenerationLabel(generation)}
            className="m-0 flex w-(--chat-media-tile-width) shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border bg-nested-surface"
            data-slot="image-generation-card"
            data-state={state}
            initial={entrance ? entrance.initial : false}
            transition={entrance?.transition}
        >
            <div className="relative h-(--chat-media-tile-height) w-full overflow-hidden bg-surface-secondary">
                {shimmer ? <PendingPicture announce={live} /> : null}
                <GenerationPicture
                    generation={generation}
                    onOpen={onOpen}
                    onRevealed={reveal}
                    serverId={serverId}
                />
            </div>
            <GenerationFooter generation={generation} />
        </motion.figure>
    );
}

/**
 * False until the frame after this card first paints, when `wait` is set. The
 * commit that mounts a new Message can be one long frame; an entrance started
 * inside it would skip its first third, so it starts on the frame after.
 */
function usePaintedOnce(wait: boolean): boolean {
    const [painted, setPainted] = React.useState(!wait);
    React.useEffect(() => {
        if (painted) {
            return;
        }
        let frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => setPainted(true));
        });
        return () => cancelAnimationFrame(frame);
    }, [painted]);
    return painted;
}

function GenerationPicture({
    generation,
    onOpen,
    onRevealed,
    serverId,
}: {
    generation: ImageGeneration;
    onOpen: () => void;
    onRevealed: () => void;
    serverId: string;
}) {
    const { result } = generation;
    switch (result.state) {
        case 'pending':
        case 'generating':
            return null;
        case 'ready':
            return (
                <ReadyPicture
                    attachmentId={result.attachmentId}
                    generation={generation}
                    onOpen={onOpen}
                    onRevealed={onRevealed}
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
function PendingPicture({ announce }: { announce: boolean }) {
    const reduceMotion = useReducedMotion();
    return (
        <>
            <Skeleton
                animationType={reduceMotion ? 'none' : 'shimmer'}
                className="absolute inset-0 rounded-none"
            />
            {announce ? <span className="sr-only">Generating image</span> : null}
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

/**
 * The decoded image over the card's shimmer. Bytes that land after mount fade
 * in, then the shimmer under them goes; bytes already decoded (a revisit)
 * show at once, before the first paint.
 */
function ReadyPicture({
    attachmentId,
    generation,
    onOpen,
    onRevealed,
    serverId,
}: {
    attachmentId: string;
    generation: ImageGeneration;
    onOpen: () => void;
    onRevealed: () => void;
    serverId: string;
}) {
    const loaded = useAttachmentImage({ attachmentId, kind: 'hosted', serverId });
    const download = useImageGenerationDownload(serverId);
    const reduceMotion = useReducedMotion();
    const [decodedAtMount] = React.useState(loaded.image !== null);
    const settled = decodedAtMount || loaded.failed;

    React.useLayoutEffect(() => {
        if (settled) {
            onRevealed();
        }
    }, [onRevealed, settled]);

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
                    <motion.img
                        alt=""
                        className="size-full object-cover"
                        height={loaded.image.height}
                        onAnimationComplete={onRevealed}
                        src={loaded.image.url}
                        width={loaded.image.width}
                        {...(decodedAtMount
                            ? { initial: false }
                            : imageGenerationReveal(reduceMotion))}
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

/** Ticks once a second while the generation runs, and only then, on the clock every card shares. */
function LiveFooter({ generation }: { generation: ImageGeneration }) {
    const now = useSecondClock();
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

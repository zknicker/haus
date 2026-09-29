import type { GeneratedAvatar } from '@haus/api/avatar-generation';
import { Skeleton } from '@heroui/react';
import { TextShimmer } from '@heroui-pro/react';
import { AlertCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import { useReducedMotion } from 'motion/react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import {
    type AvatarGenerationSession,
    latestRunSlot,
    stagedVariant,
} from './avatar-generation-session.ts';
import { AvatarStagePager } from './avatar-stage-pager.tsx';

/**
 * The hero square. It shows the staged page: a variant, the run being drawn,
 * or why that run failed; before the first run, the Agent's current mark,
 * dimmed, stands in for what is about to be replaced. With two or more pages
 * the pager floats over it, so browsing never moves the layout.
 *
 * The stage is a media surface nested in the dialog, so it takes the shell
 * tier (`card-shell`). It spans the dialog's fixed body width as a square, so
 * every state — including a long error, clamped here — renders at one size.
 */
export function AvatarGenerationStage({
    currentAvatarUrl,
    name,
    onStage,
    session,
}: {
    currentAvatarUrl: string | null;
    name: string;
    onStage: (slot: string) => void;
    session: AvatarGenerationSession;
}) {
    return (
        <div className="card-shell relative flex aspect-square w-full items-center justify-center overflow-hidden bg-surface-secondary">
            <StageContent currentAvatarUrl={currentAvatarUrl} name={name} session={session} />
            <AvatarStagePager onStage={onStage} session={session} />
        </div>
    );
}

function StageContent({
    currentAvatarUrl,
    name,
    session,
}: {
    currentAvatarUrl: string | null;
    name: string;
    session: AvatarGenerationSession;
}) {
    const variant = stagedVariant(session);
    if (variant) {
        const index = session.variants.indexOf(variant) + 1;
        return (
            <AvatarArt
                alt={`${name} avatar, variant ${index}`}
                avatar={variant.avatar}
                className="size-full"
                key={variant.id}
            />
        );
    }
    if (session.staged === latestRunSlot && session.run?.status === 'generating') {
        return <DrawingState />;
    }
    if (session.staged === latestRunSlot && session.run?.status === 'failed') {
        return (
            <div
                className="flex max-w-64 flex-col items-center gap-2 px-6 text-center"
                role="alert"
            >
                <Icon className="size-6 text-danger" icon={AlertCircleIcon} />
                <p className="line-clamp-4 text-danger text-sm" title={session.run.error}>
                    {session.run.error}
                </p>
            </div>
        );
    }
    return (
        <div className="opacity-50">
            <EntityAvatar name={name} size={64} src={currentAvatarUrl} />
        </div>
    );
}

function DrawingState() {
    const reducedMotion = useReducedMotion();
    return (
        <>
            <Skeleton
                animationType={reducedMotion ? 'none' : 'shimmer'}
                className="absolute inset-0 size-full"
            />
            <output className="relative text-sm">
                {reducedMotion ? (
                    <span className="text-muted">Drawing…</span>
                ) : (
                    <TextShimmer className="text-muted">Drawing…</TextShimmer>
                )}
            </output>
        </>
    );
}

/** Generated art is pixel art; nearest-neighbour scaling keeps its edges crisp. */
export function AvatarArt({
    alt,
    avatar,
    className,
}: {
    alt: string;
    avatar: GeneratedAvatar;
    className?: string;
}) {
    return (
        <img
            alt={alt}
            className={`${className ?? ''} fade-in animate-in [image-rendering:pixelated] motion-reduce:animate-none`}
            height={avatar.height}
            src={`data:${avatar.mediaType};base64,${avatar.bytesBase64}`}
            width={avatar.width}
        />
    );
}

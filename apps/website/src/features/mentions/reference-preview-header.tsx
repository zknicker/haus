import type * as React from 'react';
import { cn } from '../../lib/utils.ts';
import { type MentionAppearance, MentionAppearanceIcon } from './mention-appearance.tsx';

/**
 * The identity row every hover card opens with: a small mark, the subject's
 * own title, and one muted `·` clause carrying whatever that kind knows about
 * itself — a Channel's last activity, a Skill's kind, an Agent's availability,
 * a Trigger's kind. Shared so no card drifts on type scale, mark column, or
 * the grammar of that clause; supporting content sits directly below.
 */
export function ReferencePreviewHeader({
    children,
    mark,
    meta,
    title,
}: {
    children?: React.ReactNode;
    mark: React.ReactNode;
    meta: string | null;
    title: string;
}) {
    return (
        <header className="flex min-w-0 flex-col gap-1.5">
            <div className="haus-hover-card__identity flex min-w-0 items-center gap-1.5">
                {mark}
                <div className="flex min-w-0 items-baseline gap-1.5">
                    <strong className="truncate font-semibold text-foreground text-sm">
                        {title}
                    </strong>
                    {meta ? <span className="shrink-0 text-muted text-xs">· {meta}</span> : null}
                </div>
            </div>
            {children}
        </header>
    );
}

/**
 * A reference's own identity mark at the inline chip's 18px scale; the
 * three-sparkle Skill glyph passes its compact 16px size.
 */
export function ReferencePreviewMark({
    appearance,
    className,
}: {
    appearance: MentionAppearance;
    className?: string;
}) {
    return (
        <MentionAppearanceIcon
            agentAvatar={appearance.agentAvatar}
            channelAppearance={appearance.channelAppearance}
            className={cn('size-[18px] shrink-0', className)}
            icon={appearance.icon}
            iconDataUrl={appearance.iconDataUrl}
        />
    );
}

/**
 * Supporting prose below a header: one dense paragraph, muted for facts and
 * captions, foreground for the subject's own words.
 */
export function ReferencePreviewText({
    children,
    className,
    tone = 'muted',
}: {
    children: React.ReactNode;
    className?: string;
    tone?: 'foreground' | 'muted';
}) {
    return (
        <p
            className={cn(
                'text-xs leading-normal',
                tone === 'muted' ? 'text-muted' : 'text-foreground',
                className
            )}
        >
            {children}
        </p>
    );
}

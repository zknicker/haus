import { Button, Tooltip } from '@heroui/react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import {
    type AvatarGenerationSession,
    adjacentSlot,
    latestRunSlot,
    sessionSlots,
} from './avatar-generation-session.ts';

/** React Aria key events propagate only when a handler asks them to. */
interface PagerKeyEvent {
    continuePropagation: () => void;
    key: string;
}

/**
 * Browsing variants costs no layout: with two or more pages, a small pill
 * floats over the bottom of the stage. It rests dimmed so the art reads
 * first, and comes up fully on hover or keyboard focus. Left and Right page
 * while either button has focus; both ends wrap, so neither button ever
 * disables under the focus it holds.
 */
export function AvatarStagePager({
    onStage,
    session,
}: {
    onStage: (slot: string) => void;
    session: AvatarGenerationSession;
}) {
    const slots = sessionSlots(session);
    if (slots.length < 2) {
        return null;
    }
    const position = Math.max(0, slots.indexOf(session.staged ?? '')) + 1;
    const page = (delta: number) => {
        const slot = adjacentSlot(session, delta);
        if (slot) {
            onStage(slot);
        }
    };
    const onKeyDown = (event: PagerKeyEvent) => {
        const delta = pagerKeyDelta(event.key);
        if (delta === 0) {
            event.continuePropagation();
            return;
        }
        if (!session.saving) {
            page(delta);
        }
    };

    return (
        <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <div className="flex items-center gap-1 rounded-full bg-background/80 p-1 opacity-70 backdrop-blur-sm transition-opacity focus-within:opacity-100 hover:opacity-100 motion-reduce:transition-none">
                <PagerButton
                    icon={ArrowLeft01Icon}
                    isDisabled={session.saving}
                    label="Previous variant"
                    onKeyDown={onKeyDown}
                    onPress={() => page(-1)}
                />
                <span className="min-w-10 text-center text-foreground text-xs tabular-nums">
                    {position} / {slots.length}
                </span>
                <PagerButton
                    icon={ArrowRight01Icon}
                    isDisabled={session.saving}
                    label="Next variant"
                    onKeyDown={onKeyDown}
                    onPress={() => page(1)}
                />
            </div>
            <span aria-live="polite" className="sr-only">
                {pageAnnouncement(session, position, slots.length)}
            </span>
        </div>
    );
}

/** Left and Right page backward and forward; anything else is not ours. */
export function pagerKeyDelta(key: string): number {
    if (key === 'ArrowLeft') {
        return -1;
    }
    return key === 'ArrowRight' ? 1 : 0;
}

function pageAnnouncement(session: AvatarGenerationSession, position: number, total: number) {
    if (session.staged !== latestRunSlot) {
        return `Variant ${position} of ${total}`;
    }
    return session.run?.status === 'failed'
        ? `Variant ${position} of ${total} failed`
        : `Drawing variant ${position} of ${total}`;
}

function PagerButton({
    icon,
    isDisabled,
    label,
    onKeyDown,
    onPress,
}: {
    icon: React.ComponentProps<typeof Icon>['icon'];
    isDisabled: boolean;
    label: string;
    onKeyDown: (event: PagerKeyEvent) => void;
    onPress: () => void;
}) {
    return (
        <Tooltip delay={0}>
            <Button
                aria-label={label}
                isDisabled={isDisabled}
                isIconOnly
                onKeyDown={onKeyDown}
                onPress={onPress}
                size="sm"
                variant="ghost"
            >
                <Icon className="size-4" icon={icon} />
            </Button>
            <Tooltip.Content placement="top">{label}</Tooltip.Content>
        </Tooltip>
    );
}

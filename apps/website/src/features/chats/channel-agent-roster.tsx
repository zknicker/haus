import { EmptyState } from '@heroui-pro/react';
import { Button, ScrollShadow } from '@heroui/react';
import { Cancel01Icon, UserMultiple02Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';

import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import type { ChannelAgentOption } from './channel-agent-picker.tsx';

/**
 * Who is in the channel right now, in the order they were added.
 *
 * Rows, not chips and not controls: an Agent is an avatar and a name, and the
 * only thing to do to one here is take it out. A tab stop is earned by
 * interaction, so the row carries none and the remove button carries the only
 * one. Filled or empty, the roster is the same box, so adding and removing
 * Agents never moves the dialog.
 *
 * An empty roster is a state, not a missing row: the box says so itself in the
 * stock EmptyState, centred, muted, and carrying the rule it is waiting on — so
 * the line under the box has nothing left to repeat and nothing to shout.
 */
export function ChannelAgentRoster({
    agents,
    emptyDescription,
    emptyDescriptionId,
    isDisabled,
    onRemove,
}: {
    agents: ChannelAgentOption[];
    /** What the box asks for while it is empty; also the group's description. */
    emptyDescription: string;
    emptyDescriptionId: string;
    isDisabled: boolean;
    onRemove: (agentId: string) => void;
}) {
    const isEmpty = agents.length === 0;

    return (
        <ChannelAgentRosterBox isCentered={isEmpty}>
            {isEmpty ? (
                <div className="flex h-full items-center justify-center">
                    <EmptyState size="sm">
                        <EmptyState.Header>
                            <EmptyState.Media variant="icon">
                                <Icon icon={UserMultiple02Icon} />
                            </EmptyState.Media>
                            <EmptyState.Title>No agents yet</EmptyState.Title>
                            <EmptyState.Description id={emptyDescriptionId}>
                                {emptyDescription}
                            </EmptyState.Description>
                        </EmptyState.Header>
                    </EmptyState>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {agents.map((agent) => (
                        <div className="flex items-center gap-2" key={agent.id}>
                            <EntityAvatar name={agent.name} size="sm" src={agent.avatarUrl} />
                            <span className="min-w-0 truncate text-sm">{agent.name}</span>
                            <Button
                                aria-label={`Remove ${agent.name}`}
                                className="ms-auto"
                                isDisabled={isDisabled}
                                isIconOnly
                                onPress={() => onRemove(agent.id)}
                                size="sm"
                                type="button"
                                variant="ghost"
                            >
                                <Icon icon={Cancel01Icon} />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </ChannelAgentRosterBox>
    );
}

/**
 * The one fixed box every roster state is drawn in: the list, its empty state,
 * and the wait for the Agents that fill it.
 *
 * The height is chosen off the row rhythm rather than the content, so the
 * dialog cannot resize itself while it is being used. A row is a `sm` Button
 * tall — `--spacing × 9` below `md`, `× 8` above — on a `× 2` gap, and the box
 * stops deliberately short of a whole number of rows: five rows and a slice of
 * the sixth, so an overflowing roster says so at its bottom edge before anyone
 * scrolls.
 *
 * The height is the frame's, not the scroller's, because `ScrollShadow` learns
 * it has something to fade from a `ResizeObserver` on itself. Pin the scroller
 * to a fixed height and it stops resizing, so a roster that grows past the box
 * never gets its fade until the first scroll. Left to size itself against a
 * `max-height`, it resizes exactly when the clamp engages — which is exactly
 * when the fade has to appear or go.
 *
 * `isCentered` is the one state that may pin it: content that cannot overflow
 * has no fade to lose, and a definite height is what lets that content sit in
 * the middle of the box instead of at its top.
 *
 * A control paints outside its own box — 4px of focus ring — and flush against
 * the scroll container it was clipped on every side, because the remove button
 * is exactly as tall as its row. So the scroller insets its content and the
 * frame hands the same amount straight back as negative margin: the padded box
 * and the margin box cancel, rows stay on the dialog's content edge and in the
 * same rhythm, and the ring has somewhere to land.
 */
export function ChannelAgentRosterBox({
    children,
    isCentered = false,
}: {
    children: React.ReactNode;
    isCentered?: boolean;
}) {
    return (
        <div className="-m-1.5 flex h-60 flex-col md:h-56">
            <ScrollShadow className={isCentered ? 'max-h-full grow p-1.5' : 'max-h-full p-1.5'}>
                {children}
            </ScrollShadow>
        </div>
    );
}

/** One row's height, so a line of text stands where the first row would. */
export const rosterLineClassName = 'flex h-9 items-center gap-2 text-muted text-sm md:h-8';

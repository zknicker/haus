import { Chip } from '@heroui/react';
import { ItemCard, PressableFeedback } from '@heroui-pro/react';
import type * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';

export interface HubCardStatus {
    color: React.ComponentProps<typeof Chip>['color'];
    label: string;
}

/**
 * One hub card: a section's name over the fact it holds, the doorway into that
 * section. Stock ItemCard rendered as a button, per its Pressable pattern — the
 * same anatomy the profile's list rows use, so a card and a row read as one
 * family. The fact stays blank while its query settles rather than flashing a
 * zero; `status` is for a state worth color (a Computer offline), not a count.
 */
export function AgentHubCard({
    fact,
    icon,
    onPress,
    status,
    title,
}: {
    fact: string | undefined;
    icon: Parameters<typeof Icon>[0]['icon'];
    onPress: () => void;
    status?: HubCardStatus | null;
    title: string;
}) {
    const body = (
        <>
            <ItemCard.Icon>
                <Icon aria-hidden="true" icon={icon} />
            </ItemCard.Icon>
            <ItemCard.Content>
                <ItemCard.Title>{title}</ItemCard.Title>
                {/* A non-breaking space holds the line while the fact loads, so the
                    card does not grow when it lands. */}
                <ItemCard.Description>{fact ?? '\u00a0'}</ItemCard.Description>
            </ItemCard.Content>
            {status ? (
                <ItemCard.Action>
                    <Chip color={status.color} size="sm" variant="soft">
                        <Chip.Label>{status.label}</Chip.Label>
                    </Chip>
                </ItemCard.Action>
            ) : null}
        </>
    );

    return (
        <ItemCard<'button'>
            className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={onPress}
            render={(props) => <button type="button" {...props} />}
        >
            <PressableFeedback.Highlight />
            {body}
        </ItemCard>
    );
}

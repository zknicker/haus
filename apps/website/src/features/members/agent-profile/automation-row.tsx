import { Chip } from '@heroui/react';
import { ItemCard, PressableFeedback } from '@heroui-pro/react';
import { Icon } from '../../../components/ui/icon.tsx';
import type { AutomationKind } from '../../chats/automation/automation-presentation.ts';

/**
 * One Automation — a Reminder or a Trigger — as a list row: its kind as the
 * icon, its name, and one short line saying when or how it runs. Everything
 * else about it lives in the detail sheet the row opens, so a row never wraps
 * and every row in the section keeps one height. `status` is for the
 * exceptional state only; the normal state is the absence of a chip.
 */
export function AutomationRow({
    icon,
    kind,
    onPress,
    status,
    summary,
    title,
}: {
    icon: Parameters<typeof Icon>[0]['icon'];
    /** Tints the mark in its automation's ink; the glyph tells one-time from recurring. */
    kind: AutomationKind;
    /** Absent when the viewer cannot open the detail. */
    onPress?: () => void;
    status?: string | null;
    summary: string;
    title: string;
}) {
    const body = (
        <>
            {/* The theme layer (`default-theme.css`) tints the slot per kind
                and sizes the glyph. */}
            <ItemCard.Icon className={`automation-mark automation-mark--${kind}`}>
                <Icon aria-hidden="true" icon={icon} />
            </ItemCard.Icon>
            <ItemCard.Content>
                <ItemCard.Title className="truncate">{title}</ItemCard.Title>
                {/* `max-w-full` because the stock description is
                    `width:fit-content`, which a long nowrap line grows past its
                    column instead of ellipsizing. */}
                <ItemCard.Description className="max-w-full tabular-nums">
                    {summary}
                </ItemCard.Description>
            </ItemCard.Content>
            {status ? (
                <ItemCard.Action>
                    <Chip size="sm" variant="soft">
                        <Chip.Label>{status}</Chip.Label>
                    </Chip>
                </ItemCard.Action>
            ) : null}
        </>
    );

    if (!onPress) {
        return <ItemCard>{body}</ItemCard>;
    }

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

import { Button, Popover } from '@heroui/react';
import * as React from 'react';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import { identityMarkRadius } from '../../components/ui/entity-avatar.tsx';
import { type ChannelAppearance, ChannelAppearanceFields } from './channel-appearance-fields.tsx';

/**
 * A channel's icon and color previewed on the trigger and edited in one
 * popover. Channel creation uses this so the whole channel is one dialog;
 * editing an existing channel gets its own dialog instead. `header` sizes the
 * Button to its 40px tile, so a record page's title mark is its own hit target
 * and focus ring and sits on the column's left edge.
 */
export function ChannelAppearancePicker({
    appearance,
    isDisabled = false,
    onChange,
    size = 'topbar',
}: {
    appearance: ChannelAppearance;
    isDisabled?: boolean;
    onChange: (appearance: ChannelAppearance) => void;
    size?: 'header' | 'topbar';
}) {
    const [open, setOpen] = React.useState(false);

    return (
        <Popover isOpen={open} onOpenChange={setOpen}>
            <Button
                aria-label="Icon and color"
                isDisabled={isDisabled}
                className={size === 'header' ? 'channel-appearance-trigger--header' : undefined}
                isIconOnly
                style={size === 'header' ? headerTriggerStyle : undefined}
                variant="ghost"
            >
                <ChannelIconBox color={appearance.color} icon={appearance.icon} size={size} />
            </Button>
            <Popover.Content className="w-88" placement="bottom start">
                <Popover.Dialog className="flex max-h-[inherit] flex-col gap-2">
                    <Popover.Heading className="shrink-0">Icon &amp; color</Popover.Heading>
                    <ChannelAppearanceFields appearance={appearance} onChange={onChange} />
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}

const headerTriggerStyle = {
    borderRadius: identityMarkRadius(40),
    height: 40,
    minWidth: 40,
    width: 40,
} as const;

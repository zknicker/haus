import { Button, Popover } from '@heroui/react';
import * as React from 'react';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import { type ChannelAppearance, ChannelAppearanceFields } from './channel-appearance-fields.tsx';

/**
 * A channel's icon and color previewed on the trigger and edited in one
 * popover. Channel creation uses this so the whole channel is one dialog;
 * editing an existing channel gets its own dialog instead.
 */
export function ChannelAppearancePicker({
    appearance,
    isDisabled = false,
    onChange,
}: {
    appearance: ChannelAppearance;
    isDisabled?: boolean;
    onChange: (appearance: ChannelAppearance) => void;
}) {
    const [open, setOpen] = React.useState(false);

    return (
        <Popover isOpen={open} onOpenChange={setOpen}>
            <Button aria-label="Icon and color" isDisabled={isDisabled} isIconOnly variant="ghost">
                <ChannelIconBox color={appearance.color} icon={appearance.icon} size="topbar" />
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

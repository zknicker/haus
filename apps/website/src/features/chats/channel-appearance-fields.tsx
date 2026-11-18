import {
    Button,
    ColorSwatch,
    ColorSwatchPicker,
    Popover,
    SearchField,
    Tooltip,
} from '@heroui/react';
import { Undo02Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { channelColorOptions } from '../../components/chats/channel-color-options.ts';
import { Icon } from '../../components/ui/icon.tsx';
import { ChannelIconGrid, type ChannelIconGridSize } from './channel-icon-grid.tsx';

export interface ChannelAppearance {
    color: string | null;
    icon: string | null;
}

// A channel with no chosen color renders in the neutral default box, so the
// palette leads with a grey swatch that maps back to "no preset".
const defaultColorValue = '#9ca3af';

/**
 * The editable body of a channel's look: one toolbar row that searches the
 * catalog, picks the color, and resets to the hash, with the icon grid under
 * it. Shared by the create popover and the Icon & color dialog, which differ
 * only in how much room the grid gets.
 */
export function ChannelAppearanceFields({
    appearance,
    gridSize = 'compact',
    onChange,
}: {
    appearance: ChannelAppearance;
    gridSize?: ChannelIconGridSize;
    onChange: (appearance: ChannelAppearance) => void;
}) {
    const [query, setQuery] = React.useState('');
    const [isColorOpen, setIsColorOpen] = React.useState(false);
    const selectedOption = channelColorOptions.find((option) => option.id === appearance.color);
    // Stable across renders so the memoized catalog buttons stay put while the
    // selection moves.
    const selectIcon = React.useEffectEvent((icon: string) => onChange({ ...appearance, icon }));

    return (
        <>
            <div className="flex shrink-0 items-center gap-1.5">
                <SearchField
                    aria-label="Search icons"
                    className="flex-1"
                    onChange={setQuery}
                    value={query}
                    variant="secondary"
                >
                    <SearchField.Group>
                        <SearchField.SearchIcon />
                        <SearchField.Input autoFocus placeholder="Search icons..." />
                        <SearchField.ClearButton />
                    </SearchField.Group>
                </SearchField>
                <Popover isOpen={isColorOpen} onOpenChange={setIsColorOpen}>
                    <Tooltip delay={0} isDisabled={isColorOpen}>
                        <Button aria-label="Channel color" isIconOnly variant="ghost">
                            <ColorSwatch
                                color={selectedOption?.value ?? defaultColorValue}
                                shape="circle"
                                size="xs"
                            />
                        </Button>
                        <Tooltip.Content>{selectedOption?.label ?? 'Default'}</Tooltip.Content>
                    </Tooltip>
                    {/* Bounded so 19 swatches wrap into rows instead of one long
                        strip hanging off the side of the dialog. */}
                    <Popover.Content className="w-60" placement="bottom end">
                        <Popover.Dialog>
                            <ColorSwatchPicker
                                className="flex-wrap justify-center gap-1.5"
                                onChange={(color) => {
                                    const hex = color.toString('hex').toLowerCase();
                                    const option = channelColorOptions.find(
                                        (candidate) => candidate.value === hex
                                    );

                                    onChange({ ...appearance, color: option?.id ?? null });
                                    setIsColorOpen(false);
                                }}
                                size="sm"
                                value={selectedOption?.value ?? defaultColorValue}
                            >
                                <ColorSwatchPicker.Item
                                    aria-label="Default"
                                    color={defaultColorValue}
                                >
                                    <ColorSwatchPicker.Swatch />
                                </ColorSwatchPicker.Item>
                                {channelColorOptions.map((option) => (
                                    <ColorSwatchPicker.Item
                                        aria-label={option.label}
                                        color={option.value}
                                        key={option.id}
                                    >
                                        <ColorSwatchPicker.Swatch />
                                    </ColorSwatchPicker.Item>
                                ))}
                            </ColorSwatchPicker>
                        </Popover.Dialog>
                    </Popover.Content>
                </Popover>
                <Tooltip>
                    <Button
                        aria-label="Reset to hash"
                        isDisabled={appearance.icon === null}
                        isIconOnly
                        onPress={() => onChange({ ...appearance, icon: null })}
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={Undo02Icon} size={18} />
                    </Button>
                    <Tooltip.Content>Reset to hash</Tooltip.Content>
                </Tooltip>
            </div>
            <ChannelIconGrid
                color={appearance.color}
                onSelect={selectIcon}
                query={query}
                selectedIcon={appearance.icon}
                size={gridSize}
            />
        </>
    );
}

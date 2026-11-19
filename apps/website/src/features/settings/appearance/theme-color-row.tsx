import { ItemCard } from '@heroui-pro/react';
import {
    type Color,
    ColorArea,
    ColorField,
    ColorPicker,
    ColorSlider,
    ColorSwatch,
    parseColor,
} from '@heroui/react';
import { useState } from 'react';
import { type HexColor, parseHexColor, type ThemeColorRole } from '../../../lib/custom-themes.ts';

export function ThemeColorRow({
    effective,
    onChange,
    role,
    stored,
}: {
    effective: HexColor;
    onChange: (color: HexColor | null) => void;
    role: ThemeColorRole;
    stored: HexColor | undefined;
}) {
    const [picked, setPicked] = useState(() => parseColor(effective));
    const color = toHex(picked) === effective ? picked : parseColor(effective);
    const pick = (next: Color) => {
        setPicked(next);
        onChange(toHex(next));
    };
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>{role.label}</ItemCard.Title>
            </ItemCard.Content>
            <ItemCard.Action>
                <div className="flex items-center gap-2">
                    <ColorPicker onChange={pick} value={color}>
                        <ColorPicker.Trigger aria-label={`Pick ${role.label.toLowerCase()} color`}>
                            <ColorSwatch size="sm" />
                        </ColorPicker.Trigger>
                        <ColorPicker.Popover placement="bottom end">
                            <ColorArea
                                aria-label={`${role.label} saturation and brightness`}
                                className="max-w-full"
                                colorSpace="hsb"
                                xChannel="saturation"
                                yChannel="brightness"
                            >
                                <ColorArea.Thumb />
                            </ColorArea>
                            <ColorSlider
                                aria-label={`${role.label} hue`}
                                channel="hue"
                                colorSpace="hsb"
                            >
                                <ColorSlider.Track>
                                    <ColorSlider.Thumb />
                                </ColorSlider.Track>
                            </ColorSlider>
                        </ColorPicker.Popover>
                    </ColorPicker>
                    <ColorField
                        aria-label={`${role.label} hex`}
                        className="w-28"
                        onChange={(next) => onChange(next ? toHex(next) : null)}
                        value={stored ? parseColor(stored) : null}
                    >
                        <ColorField.Group variant="secondary">
                            <ColorField.Input placeholder={effective.toUpperCase()} />
                        </ColorField.Group>
                    </ColorField>
                </div>
            </ItemCard.Action>
        </ItemCard>
    );
}

function toHex(color: Color) {
    return parseHexColor(color.toString('hex'));
}

import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Dropdown, Label } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import type { CSSProperties } from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { useBackgroundImageUrl } from '../../../hooks/shell/use-background-image-url.ts';
import {
    saveThemeBackground,
    useThemeBackground,
} from '../../../hooks/shell/use-theme-background.ts';
import type { ColorTheme } from '../../../lib/color-theme.ts';
import { homeInputOpacity } from '../../../lib/home-background-style.ts';
import {
    backgroundAdjustments,
    type BackgroundImageRef,
    type ThemeBackground,
    withDefaultAdjustments,
} from '../../../lib/home-background.ts';
import { HomeBackgroundLayers } from '../../home-background/home-background-layers.tsx';
import { SettingsRowError } from '../layout/settings-text.tsx';
import { BackgroundAdjustments } from './background-adjustments.tsx';
import { BackgroundSourcePicker } from './background-source-picker.tsx';
import { removeBackgroundImage, useBackgroundUpload } from './use-background-upload.tsx';

export function BackgroundSection({ theme }: { theme: ColorTheme }) {
    const background = useThemeBackground(theme);
    const upload = useBackgroundUpload(theme);
    const isDefault =
        background.effect === 'none' &&
        backgroundAdjustments.every(
            (adjustment) => background.adjustments[adjustment.id] === adjustment.defaultValue
        );

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Background</ItemCardGroup.Title>
                <Button
                    isDisabled={isDefault}
                    onPress={() => saveThemeBackground(theme, withDefaultAdjustments(background))}
                    size="sm"
                    variant="ghost"
                >
                    Reset to defaults
                </Button>
            </ItemCardGroup.Header>
            <div className="grid gap-3">
                <BackgroundPreview background={background} />
                <BackgroundSourcePicker
                    background={background}
                    onChooseImage={upload.choose}
                    theme={theme}
                />
                {upload.input}
                <SettingsRowError>{upload.error}</SettingsRowError>
                {background.source === 'image' && background.image ? (
                    <ImageRow image={background.image} onReplace={upload.choose} theme={theme} />
                ) : null}
                {background.source === 'none' ? null : (
                    <BackgroundAdjustments background={background} key={theme} theme={theme} />
                )}
            </div>
        </ItemCardGroup>
    );
}

function BackgroundPreview({ background }: { background: ThemeBackground }) {
    return (
        <div
            aria-hidden="true"
            className="home-background-preview"
            style={{ '--home-input-opacity': homeInputOpacity(background) } as CSSProperties}
        >
            <HomeBackgroundLayers background={background} />
            <div className="home-background-preview__composer">
                <span className="home-background-preview__line" />
                <span className="home-background-preview__send" />
            </div>
        </div>
    );
}

function ImageRow({
    image,
    onReplace,
    theme,
}: {
    image: BackgroundImageRef;
    onReplace: () => void;
    theme: ColorTheme;
}) {
    const url = useBackgroundImageUrl(image);
    return (
        <ItemCardGroup>
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>Image</ItemCard.Title>
                    <ItemCard.Description className="truncate">
                        {url?.status === 'missing' ? 'Missing on this device' : image.name}
                    </ItemCard.Description>
                </ItemCard.Content>
                <ItemCard.Action>
                    <Dropdown>
                        <Button aria-label="Image actions" isIconOnly size="sm" variant="ghost">
                            <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
                        </Button>
                        <Dropdown.Popover placement="bottom end">
                            <Dropdown.Menu
                                onAction={(key) => {
                                    if (key === 'remove') {
                                        removeBackgroundImage(theme);
                                    } else {
                                        onReplace();
                                    }
                                }}
                            >
                                <Dropdown.Item id="replace" textValue="Replace image">
                                    <Label>Replace image</Label>
                                </Dropdown.Item>
                                <Dropdown.Item
                                    id="remove"
                                    textValue="Remove image"
                                    variant="danger"
                                >
                                    <Label>Remove image</Label>
                                </Dropdown.Item>
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                </ItemCard.Action>
            </ItemCard>
        </ItemCardGroup>
    );
}

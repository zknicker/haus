import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import type { CSSProperties } from 'react';
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
            <ItemCardGroup.Header className="flex items-center justify-between">
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
                {upload.error ? <p className="text-danger px-1 text-sm">{upload.error}</p> : null}
                {background.image ? (
                    <ImageRow image={background.image} onReplace={upload.choose} theme={theme} />
                ) : null}
                {background.source === 'none' ? null : (
                    <BackgroundAdjustments background={background} theme={theme} />
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
        <ItemCardGroup className="overflow-hidden">
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>Image</ItemCard.Title>
                    <ItemCard.Description className="truncate">
                        {url?.status === 'missing' ? 'Missing on this device' : image.name}
                    </ItemCard.Description>
                </ItemCard.Content>
                <ItemCard.Action className="flex gap-2">
                    <Button onPress={onReplace} size="sm" variant="secondary">
                        Replace
                    </Button>
                    <Button
                        onPress={() => removeBackgroundImage(theme)}
                        size="sm"
                        variant="danger-soft"
                    >
                        Remove
                    </Button>
                </ItemCard.Action>
            </ItemCard>
        </ItemCardGroup>
    );
}

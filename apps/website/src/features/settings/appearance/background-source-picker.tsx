import { RadioButtonGroup } from '@heroui-pro/react';
import { Label } from '@heroui/react';
import { ImageAdd01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { saveThemeBackground } from '../../../hooks/shell/use-theme-background.ts';
import type { ColorTheme } from '../../../lib/color-theme.ts';
import {
    backgroundPatterns,
    type BackgroundSource,
    parseBackgroundSource,
    type ThemeBackground,
    themeBackground,
} from '../../../lib/home-background.ts';
import { HomeBackgroundLayers } from '../../home-background/home-background-layers.tsx';

const sourceTiles = [
    { id: 'none', label: 'None' },
    ...backgroundPatterns,
    { id: 'image', label: 'Image' },
] as const satisfies ReadonlyArray<{ id: BackgroundSource; label: string }>;

export function BackgroundSourcePicker({
    background,
    onChooseImage,
    theme,
}: {
    background: ThemeBackground;
    onChooseImage: () => void;
    theme: ColorTheme;
}) {
    const pick = (value: unknown) => {
        const source = parseBackgroundSource(value);
        if (!source) {
            return;
        }
        if (source === 'image' && !background.image) {
            onChooseImage();
            return;
        }
        saveThemeBackground(theme, { ...background, source });
    };

    return (
        <RadioButtonGroup
            aria-label="Background"
            className="theme-gallery grid-cols-4"
            layout="grid"
            onChange={pick}
            value={background.source}
        >
            {sourceTiles.map((tile) => (
                <RadioButtonGroup.Item key={tile.id} value={tile.id}>
                    <RadioButtonGroup.ItemContent>
                        <div aria-hidden="true" className="home-background-tile">
                            <SourceTileArt background={background} source={tile.id} />
                        </div>
                        <Label className="max-w-full truncate">{tile.label}</Label>
                    </RadioButtonGroup.ItemContent>
                </RadioButtonGroup.Item>
            ))}
        </RadioButtonGroup>
    );
}

function SourceTileArt({
    background,
    source,
}: {
    background: ThemeBackground;
    source: BackgroundSource;
}) {
    if (source === 'none') {
        return null;
    }
    if (source === 'image' && !background.image) {
        return <Icon icon={ImageAdd01Icon} size={20} />;
    }
    return (
        <HomeBackgroundLayers
            background={{ ...themeBackground(source), image: background.image }}
        />
    );
}

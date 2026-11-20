import { CellSlider } from '@heroui-pro/react';
import * as React from 'react';
import {
    previewThemeBackground,
    saveThemeBackground,
    settleThemeBackgroundPreview,
} from '../../../hooks/shell/use-theme-background.ts';
import type { ColorTheme } from '../../../lib/color-theme.ts';
import {
    type BackgroundAdjustment,
    type ThemeBackground,
    withAdjustment,
} from '../../../lib/home-background.ts';

const percent = { maximumFractionDigits: 0, style: 'unit', unit: 'percent' } as const;

export function AdjustmentSlider({
    adjustment,
    background,
    theme,
}: {
    adjustment: BackgroundAdjustment;
    background: ThemeBackground;
    theme: ColorTheme;
}) {
    const pressed = React.useRef(false);
    React.useEffect(() => settleThemeBackgroundPreview, []);

    const apply = (value: number | number[], live: boolean) => {
        if (typeof value !== 'number') {
            return;
        }
        const next = withAdjustment(background, adjustment.id, value);
        if (live) {
            previewThemeBackground(theme, next);
        } else {
            saveThemeBackground(theme, next);
        }
    };

    return (
        <div
            onPointerDownCapture={() => {
                pressed.current = true;
                const release = () => {
                    pressed.current = false;
                };
                window.addEventListener('pointerup', release, { once: true });
                window.addEventListener('pointercancel', release, { once: true });
            }}
        >
            <CellSlider
                aria-label={adjustment.label}
                formatOptions={percent}
                maxValue={adjustment.max}
                minValue={adjustment.min}
                onChange={(value) => apply(value, pressed.current)}
                onChangeEnd={(value) => apply(value, false)}
                step={1}
                value={background.adjustments[adjustment.id]}
            >
                <CellSlider.Track>
                    <CellSlider.Fill />
                    <CellSlider.Thumb />
                    <CellSlider.Label>{adjustment.label}</CellSlider.Label>
                    <CellSlider.Output />
                </CellSlider.Track>
            </CellSlider>
        </div>
    );
}

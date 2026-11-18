import type { HugeiconsIconProps, IconSvgElement } from '@hugeicons/react';
import { brandIconProps } from '../../shell/brand.ts';

export type SettingsIconComponent = IconSvgElement;

export function settingsAccentStyle(): Pick<
    HugeiconsIconProps,
    'disableSecondaryOpacity' | 'primaryColor' | 'secondaryColor' | 'strokeWidth'
> {
    return brandIconProps(true);
}

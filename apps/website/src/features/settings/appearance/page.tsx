import { ItemCardGroup } from '@heroui-pro/react';
import { useColorTheme } from '../../../hooks/shell/use-color-theme.ts';
import { useCustomTheme } from '../../../hooks/shell/use-custom-themes.ts';
import { isCustomTheme } from '../../../lib/color-theme.ts';
import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { BackgroundSection } from './background-section.tsx';
import { CustomThemeColors } from './custom-theme-colors.tsx';
import { CustomThemeDetails } from './custom-theme-details.tsx';
import { ModeRow } from './mode-row.tsx';
import { SnowRow } from './snow-row.tsx';
import { ThemeGallery } from './theme-gallery.tsx';

export function AppearanceSettings() {
    const theme = useColorTheme();
    const customTheme = useCustomTheme(isCustomTheme(theme) ? theme : null);

    return (
        <SettingsPageColumn>
            <SettingsPageHeader title="Appearance" />
            <ItemCardGroup className="overflow-hidden">
                <ModeRow />
            </ItemCardGroup>
            <ThemeGallery />
            <SnowRow />
            {customTheme ? (
                <>
                    <CustomThemeDetails key={customTheme.id} theme={customTheme} />
                    <CustomThemeColors key={`${customTheme.id}-colors`} theme={customTheme} />
                </>
            ) : null}
            <BackgroundSection theme={theme} />
        </SettingsPageColumn>
    );
}

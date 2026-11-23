import { ItemCardGroup, Segment } from '@heroui-pro/react';
import { Button, Disclosure, Separator } from '@heroui/react';
import { Fragment, useMemo, useState } from 'react';
import { useTheme } from '../../../components/theme-provider.tsx';
import { updateCustomTheme } from '../../../hooks/shell/use-custom-themes.ts';
import {
    type CustomTheme,
    type HexColor,
    type ThemeColorRole,
    type ThemeMode,
    themeColorRoles,
    withThemeColor,
} from '../../../lib/custom-themes.ts';
import { type ResolvedThemeColors, readThemeColors } from '../../../lib/theme-probe.ts';
import { ThemeColorRow } from './theme-color-row.tsx';

const coreRoles = themeColorRoles.filter((role) => role.tier === 'core');
const advancedRoles = themeColorRoles.filter((role) => role.tier === 'advanced');

export function CustomThemeColors({ theme }: { theme: CustomTheme }) {
    const { resolvedTheme } = useTheme();
    const [mode, setMode] = useState<ThemeMode>(resolvedTheme);
    const effective = useMemo(() => readThemeColors(document, theme.id, mode), [theme, mode]);
    const setColor = (role: ThemeColorRole, color: HexColor | null) =>
        updateCustomTheme(theme.id, (current) => ({
            ...current,
            [mode]: withThemeColor(current[mode], role.id, color),
        }));
    const rows = (roles: readonly ThemeColorRole[]) => (
        <ColorRows
            colors={theme[mode]}
            effective={effective}
            key={mode}
            onChange={setColor}
            roles={roles}
        />
    );

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Colors</ItemCardGroup.Title>
                <Segment
                    aria-label="Colors for mode"
                    onSelectionChange={(key) => setMode(key === 'dark' ? 'dark' : 'light')}
                    selectedKey={mode}
                    size="sm"
                >
                    <Segment.Item id="light">Light</Segment.Item>
                    <Segment.Item id="dark">Dark</Segment.Item>
                </Segment>
            </ItemCardGroup.Header>
            <div className="grid gap-2">
                <ItemCardGroup>{rows(coreRoles)}</ItemCardGroup>
                <Disclosure>
                    <Disclosure.Heading>
                        <Button size="sm" slot="trigger" variant="ghost">
                            Advanced colors
                            <Disclosure.Indicator />
                        </Button>
                    </Disclosure.Heading>
                    <Disclosure.Content>
                        <ItemCardGroup>{rows(advancedRoles)}</ItemCardGroup>
                    </Disclosure.Content>
                </Disclosure>
            </div>
        </ItemCardGroup>
    );
}

function ColorRows({
    colors,
    effective,
    onChange,
    roles,
}: {
    colors: CustomTheme['light'];
    effective: ResolvedThemeColors;
    onChange: (role: ThemeColorRole, color: HexColor | null) => void;
    roles: readonly ThemeColorRole[];
}) {
    return roles.map((role, index) => (
        <Fragment key={role.id}>
            {index > 0 ? <Separator /> : null}
            <ThemeColorRow
                effective={effective[role.id]}
                onChange={(color) => onChange(role, color)}
                role={role}
                stored={colors[role.id]}
            />
        </Fragment>
    ));
}

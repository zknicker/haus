import { ToggleButton, ToggleButtonGroup, Tooltip } from '@heroui/react';
import { GridViewIcon, ListViewIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import {
    type ArtifactLibraryLayout,
    setArtifactLibraryLayout,
    useArtifactLibraryLayout,
} from './library-layout.ts';

export const libraryLayouts: readonly {
    icon: typeof GridViewIcon;
    id: ArtifactLibraryLayout;
    label: string;
}[] = [
    { icon: ListViewIcon, id: 'list', label: 'List' },
    { icon: GridViewIcon, id: 'grid', label: 'Grid' },
];

/** The band's list/grid switch; a narrow band moves it into the Filters menu. */
export function ArtifactLayoutToggle() {
    const layout = useArtifactLibraryLayout();
    return (
        <ToggleButtonGroup
            aria-label="Layout"
            disallowEmptySelection
            onSelectionChange={(keys) => {
                const next = libraryLayouts.find((entry) => keys.has(entry.id));
                if (next) {
                    setArtifactLibraryLayout(next.id);
                }
            }}
            selectedKeys={[layout]}
            selectionMode="single"
            size="sm"
        >
            {libraryLayouts.map((entry, index) => (
                <Tooltip delay={0} key={entry.id}>
                    <ToggleButton aria-label={entry.label} id={entry.id} isIconOnly>
                        {index > 0 ? <ToggleButtonGroup.Separator /> : null}
                        <Icon icon={entry.icon} size={16} />
                    </ToggleButton>
                    <Tooltip.Content>{entry.label}</Tooltip.Content>
                </Tooltip>
            ))}
        </ToggleButtonGroup>
    );
}

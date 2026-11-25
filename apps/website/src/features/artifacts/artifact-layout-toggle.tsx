import { Segment } from '@heroui-pro/react';
import { Tooltip } from '@heroui/react';
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

/**
 * The band's list/grid switch, a stock Segment so the open layout wears the
 * neutral selected-segment material; accent stays for selection. A narrow
 * band moves it into the Filter menu.
 */
export function ArtifactLayoutToggle() {
    const layout = useArtifactLibraryLayout();
    return (
        <Segment
            aria-label="Layout"
            onSelectionChange={(key) => {
                const next = libraryLayouts.find((entry) => entry.id === key);
                if (next) {
                    setArtifactLibraryLayout(next.id);
                }
            }}
            selectedKey={layout}
            size="sm"
        >
            {libraryLayouts.map((entry) => (
                <Tooltip delay={0} key={entry.id}>
                    <Segment.Item aria-label={entry.label} id={entry.id}>
                        <Icon icon={entry.icon} size={16} />
                    </Segment.Item>
                    <Tooltip.Content>{entry.label}</Tooltip.Content>
                </Tooltip>
            ))}
        </Segment>
    );
}

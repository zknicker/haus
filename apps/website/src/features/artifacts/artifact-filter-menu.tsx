import type { ArtifactCreator } from '@haus/api';
import { Button, Description, Dropdown, Header, Label, Separator } from '@heroui/react';
import { FilterHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { ArtifactCreatorOptions, useCreatorLabel } from './artifact-creator-menu.tsx';
import { ArtifactKindOptions, kindTitles } from './artifact-kind-menu.tsx';
import { libraryLayouts } from './artifact-layout-toggle.tsx';
import { setArtifactLibraryLayout, useArtifactLibraryLayout } from './library-layout.ts';
import type { ArtifactKindFilter } from './library-params.ts';

/**
 * The band's controls folded for a narrow band: one Filters menu holding the
 * file-type and Created by choices as submenus (each naming its current
 * value) and the list/grid choice, so search keeps its width.
 */
export function ArtifactFilterMenu({
    creator,
    kind,
    onCreatorChange,
    onKindChange,
    serverId,
}: {
    creator: ArtifactCreator | null;
    kind: ArtifactKindFilter;
    onCreatorChange: (creator: ArtifactCreator | null) => void;
    onKindChange: (kind: ArtifactKindFilter) => void;
    serverId: string;
}) {
    const creatorLabel = useCreatorLabel(serverId, creator);
    const layout = useArtifactLibraryLayout();
    const filtered = kind !== 'all' || creator !== null;
    return (
        <Dropdown>
            <Button
                aria-label={filtered ? 'Filters (on)' : 'Filters'}
                isIconOnly
                size="sm"
                variant={filtered ? 'secondary' : 'ghost'}
            >
                <Icon icon={FilterHorizontalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu aria-label="Filters">
                    <Dropdown.SubmenuTrigger>
                        <Dropdown.Item id="kind" textValue="File type">
                            <Label>File type</Label>
                            <Description>{kindTitles[kind]}</Description>
                            <Dropdown.SubmenuIndicator />
                        </Dropdown.Item>
                        <Dropdown.Popover>
                            <ArtifactKindOptions kind={kind} onKindChange={onKindChange} />
                        </Dropdown.Popover>
                    </Dropdown.SubmenuTrigger>
                    <Dropdown.SubmenuTrigger>
                        <Dropdown.Item id="creator" textValue="Created by">
                            <Label>Created by</Label>
                            <Description>{creatorLabel}</Description>
                            <Dropdown.SubmenuIndicator />
                        </Dropdown.Item>
                        <Dropdown.Popover>
                            <ArtifactCreatorOptions
                                creator={creator}
                                onCreatorChange={onCreatorChange}
                                serverId={serverId}
                            />
                        </Dropdown.Popover>
                    </Dropdown.SubmenuTrigger>
                    <Separator />
                    <Dropdown.Section
                        disallowEmptySelection
                        onSelectionChange={(keys) => {
                            const next = libraryLayouts.find(
                                (entry) => keys !== 'all' && keys.has(entry.id)
                            );
                            if (next) {
                                setArtifactLibraryLayout(next.id);
                            }
                        }}
                        selectedKeys={new Set([layout])}
                        selectionMode="single"
                    >
                        <Header>View</Header>
                        {libraryLayouts.map((entry) => (
                            <Dropdown.Item id={entry.id} key={entry.id} textValue={entry.label}>
                                <Icon icon={entry.icon} size={16} />
                                <Label>{entry.label}</Label>
                                <Dropdown.ItemIndicator />
                            </Dropdown.Item>
                        ))}
                    </Dropdown.Section>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

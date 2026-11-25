import type { ArtifactCreator } from '@haus/api';
import { Button, Description, Dropdown, Header, Label, Separator } from '@heroui/react';
import {
    Cancel01Icon,
    File02Icon,
    FilterHorizontalIcon,
    Sorting01Icon,
    UserIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { ArtifactCreatorOptions, useCreatorLabel } from './artifact-creator-menu.tsx';
import { ArtifactKindOptions, kindTitles } from './artifact-kind-menu.tsx';
import { libraryLayouts } from './artifact-layout-toggle.tsx';
import { ArtifactSortOptions } from './artifact-sort-menu.tsx';
import { setArtifactLibraryLayout, useArtifactLibraryLayout } from './library-layout.ts';
import type { ArtifactKindFilter } from './library-params.ts';
import { librarySortKeys, useArtifactLibrarySort } from './library-sort.ts';

/**
 * The band's one Filter button: File type and Created by as submenus, each
 * naming its current value, and Clear filters once one is set. Quiet until a
 * filter is on, when it counts them. `folded` is the narrow band's version,
 * which also carries the layout choice and, in the grid, Sort.
 */
export function ArtifactFilterMenu({
    creator,
    fileFilters,
    folded,
    kind,
    onClearFilters,
    onCreatorChange,
    onKindChange,
    serverId,
}: {
    creator: ArtifactCreator | null;
    /** Whether the open folder has files for File type and Created by to narrow. */
    fileFilters: boolean;
    folded: boolean;
    kind: ArtifactKindFilter;
    onClearFilters: () => void;
    onCreatorChange: (creator: ArtifactCreator | null) => void;
    onKindChange: (kind: ArtifactKindFilter) => void;
    serverId: string;
}) {
    const creatorLabel = useCreatorLabel(serverId, creator);
    const layout = useArtifactLibraryLayout();
    const sort = useArtifactLibrarySort();
    const active = activeFilterCount(kind, creator);
    const filters = fileFilters || active > 0;
    return (
        <Dropdown>
            <Button
                aria-label={active > 0 ? `Filter (${active} on)` : 'Filter'}
                isIconOnly={active === 0}
                size="sm"
                variant="ghost"
            >
                <Icon aria-hidden="true" icon={FilterHorizontalIcon} size={16} />
                {active > 0 ? <span className="tabular-nums">{active}</span> : null}
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    aria-label="Filter"
                    onAction={(key) => {
                        if (key === 'clear') {
                            onClearFilters();
                        }
                    }}
                >
                    {filters ? (
                        <Dropdown.Section>
                            <Dropdown.SubmenuTrigger>
                                <Dropdown.Item id="kind" textValue="File type">
                                    <Icon aria-hidden="true" icon={File02Icon} size={16} />
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
                                    <Icon aria-hidden="true" icon={UserIcon} size={16} />
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
                            {active > 0 ? (
                                <Dropdown.Item id="clear" textValue="Clear filters">
                                    <Icon aria-hidden="true" icon={Cancel01Icon} size={16} />
                                    <Label>Clear filters</Label>
                                </Dropdown.Item>
                            ) : null}
                        </Dropdown.Section>
                    ) : null}
                    {folded && filters ? <Separator /> : null}
                    {folded && layout === 'grid' ? (
                        <Dropdown.Section>
                            <Dropdown.SubmenuTrigger>
                                <Dropdown.Item id="sort" textValue="Sort by">
                                    <Icon aria-hidden="true" icon={Sorting01Icon} size={16} />
                                    <Label>Sort by</Label>
                                    <Description>
                                        {
                                            librarySortKeys.find((entry) => entry.id === sort.by)
                                                ?.label
                                        }
                                    </Description>
                                    <Dropdown.SubmenuIndicator />
                                </Dropdown.Item>
                                <Dropdown.Popover>
                                    <ArtifactSortOptions />
                                </Dropdown.Popover>
                            </Dropdown.SubmenuTrigger>
                        </Dropdown.Section>
                    ) : null}
                    {folded && layout === 'grid' ? <Separator /> : null}
                    {folded ? (
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
                    ) : null}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

/** How many of the band's file filters are narrowing the folder. */
export function activeFilterCount(kind: ArtifactKindFilter, creator: ArtifactCreator | null) {
    return (kind === 'all' ? 0 : 1) + (creator === null ? 0 : 1);
}

import {
    Button,
    Dropdown,
    Label,
    SearchField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
} from '@heroui/react';
import { ArrowDown01Icon, GridViewIcon, ListViewIcon } from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import {
    type ArtifactLibraryLayout,
    setArtifactLibraryLayout,
    useArtifactLibraryLayout,
} from './library-layout.ts';
import { type ArtifactKindFilter, artifactKindFilters } from './library-params.ts';

const kindTitles: Record<ArtifactKindFilter, string> = {
    all: 'All types',
    documents: 'Documents',
    images: 'Images',
    media: 'Media',
    other: 'Other',
};

/**
 * The library's band controls: search, the file-type and Created by menus,
 * list or grid, then Upload. They trail the drive trail in the shell band, so
 * the page below is all content. Search covers the open folder and every
 * folder under it.
 */
export function ArtifactLibraryControls({
    creatorMenu,
    folderName,
    kind,
    onKindChange,
    onSearchChange,
    search,
    uploadMenu,
}: {
    creatorMenu: ReactNode;
    /** The open folder's name; null at the drive root. */
    folderName: string | null;
    kind: ArtifactKindFilter;
    onKindChange: (kind: ArtifactKindFilter) => void;
    onSearchChange: (value: string) => void;
    search: string;
    uploadMenu: ReactNode;
}) {
    return (
        <>
            <SearchField
                aria-label={folderName ? `Search in ${folderName}` : 'Search artifacts'}
                className="w-44 min-w-0 shrink"
                onChange={onSearchChange}
                value={search}
            >
                <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input
                        placeholder={folderName ? `Search in ${folderName}` : 'Search files'}
                    />
                    <SearchField.ClearButton />
                </SearchField.Group>
            </SearchField>
            <ArtifactKindMenu kind={kind} onKindChange={onKindChange} />
            {creatorMenu}
            <ArtifactLayoutToggle />
            {uploadMenu}
        </>
    );
}

/** A stock single-select menu, the Activity page's filter shape: the open kind is the label. */
function ArtifactKindMenu({
    kind,
    onKindChange,
}: {
    kind: ArtifactKindFilter;
    onKindChange: (kind: ArtifactKindFilter) => void;
}) {
    return (
        <Dropdown>
            <Button aria-label={`File type: ${kindTitles[kind]}`} size="sm" variant="ghost">
                {kindTitles[kind]}
                <Icon aria-hidden="true" icon={ArrowDown01Icon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    aria-label="File type"
                    disallowEmptySelection
                    onSelectionChange={(keys) => {
                        const next = artifactKindFilters.find(
                            (entry) => keys !== 'all' && keys.has(entry)
                        );
                        if (next) {
                            onKindChange(next);
                        }
                    }}
                    selectedKeys={new Set([kind])}
                    selectionMode="single"
                >
                    {artifactKindFilters.map((entry) => (
                        <Dropdown.Item id={entry} key={entry} textValue={kindTitles[entry]}>
                            <Label>{kindTitles[entry]}</Label>
                            <Dropdown.ItemIndicator />
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

const layouts: readonly { icon: typeof GridViewIcon; id: ArtifactLibraryLayout; label: string }[] =
    [
        { icon: ListViewIcon, id: 'list', label: 'List' },
        { icon: GridViewIcon, id: 'grid', label: 'Grid' },
    ];

function ArtifactLayoutToggle() {
    const layout = useArtifactLibraryLayout();
    return (
        <ToggleButtonGroup
            aria-label="Layout"
            disallowEmptySelection
            onSelectionChange={(keys) => {
                const next = layouts.find((entry) => keys.has(entry.id));
                if (next) {
                    setArtifactLibraryLayout(next.id);
                }
            }}
            selectedKeys={[layout]}
            selectionMode="single"
            size="sm"
        >
            {layouts.map((entry, index) => (
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

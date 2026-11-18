import { Button, Dropdown, Label } from '@heroui/react';
import { ArrowDown01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { type ArtifactKindFilter, artifactKindFilters } from './library-params.ts';

export const kindTitles: Record<ArtifactKindFilter, string> = {
    all: 'All types',
    documents: 'Documents',
    images: 'Images',
    media: 'Media',
    other: 'Other',
};

interface KindFilterProps {
    kind: ArtifactKindFilter;
    onKindChange: (kind: ArtifactKindFilter) => void;
}

/** A stock single-select menu, the Activity page's filter shape: the open kind is the label. */
export function ArtifactKindMenu({ kind, onKindChange }: KindFilterProps) {
    return (
        <Dropdown>
            <Button aria-label={`File type: ${kindTitles[kind]}`} size="sm" variant="ghost">
                {kindTitles[kind]}
                <Icon aria-hidden="true" icon={ArrowDown01Icon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <ArtifactKindOptions kind={kind} onKindChange={onKindChange} />
            </Dropdown.Popover>
        </Dropdown>
    );
}

/** The file-type choices, shared by the band's menu and the compact Filters submenu. */
export function ArtifactKindOptions({ kind, onKindChange }: KindFilterProps) {
    return (
        <Dropdown.Menu
            aria-label="File type"
            disallowEmptySelection
            onSelectionChange={(keys) => {
                const next = artifactKindFilters.find((entry) => keys !== 'all' && keys.has(entry));
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
    );
}

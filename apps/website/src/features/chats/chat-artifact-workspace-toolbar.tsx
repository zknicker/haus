import { Button, Dropdown, Label, SearchField, Toolbar } from '@heroui/react';
import {
    File01Icon,
    FilterHorizontalIcon,
    Link01Icon,
    MoreHorizontalIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { writeClipboardText } from '../../lib/clipboard.ts';
import { SectionBar } from '../shell/section-header.tsx';
import { formatHausResourceLink } from './haus-resource-link.ts';

interface WorkspaceFilterProps {
    includeHidden: boolean;
    onIncludeHiddenChange: (value: boolean) => void;
}

interface WorkspaceSearchProps extends WorkspaceFilterProps {
    onQueryChange: (value: string) => void;
    query: string;
}

interface WorkspacePageToolbarProps extends WorkspaceFilterProps {
    children?: ReactNode;
    selectedPath: null | string;
    /** Shown while no file is open; null when the host already titles the page. */
    title?: null | string;
}

export function WorkspacePageToolbar({
    children,
    includeHidden,
    onIncludeHiddenChange,
    selectedPath,
    title = 'Workspace',
}: WorkspacePageToolbarProps) {
    const label = selectedPath ?? title;
    return (
        <div className="shrink-0 border-separator border-y">
            <SectionBar>
                <Toolbar aria-label="Workspace tools" className="flex w-full gap-1">
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                        {label ? (
                            <span
                                className="min-w-0 truncate px-2 text-muted text-sm"
                                title={label}
                            >
                                {label}
                            </span>
                        ) : null}
                        {children}
                    </div>
                    <WorkspaceFilter
                        includeHidden={includeHidden}
                        onIncludeHiddenChange={onIncludeHiddenChange}
                    />
                    <WorkspaceOptions selectedPath={selectedPath} />
                </Toolbar>
            </SectionBar>
        </div>
    );
}

export function WorkspacePageRailSearch({
    onQueryChange,
    query,
}: Pick<WorkspaceSearchProps, 'onQueryChange' | 'query'>) {
    return (
        <div className="shrink-0 p-2">
            <WorkspaceSearch className="w-full" onQueryChange={onQueryChange} query={query} />
        </div>
    );
}

export function WorkspaceRailToolbar({
    includeHidden,
    onIncludeHiddenChange,
    onQueryChange,
    query,
}: WorkspaceSearchProps) {
    return (
        <div className="flex shrink-0 flex-row items-center gap-1 p-2">
            <WorkspaceSearch
                className="min-w-0 flex-1"
                onQueryChange={onQueryChange}
                query={query}
            />
            <WorkspaceFilter
                includeHidden={includeHidden}
                onIncludeHiddenChange={onIncludeHiddenChange}
                variant="secondary"
            />
        </div>
    );
}

function WorkspaceSearch({
    className,
    onQueryChange,
    query,
}: {
    className: string;
    onQueryChange: (value: string) => void;
    query: string;
}) {
    return (
        <SearchField
            aria-label="Search files"
            className={className}
            onChange={onQueryChange}
            value={query}
            variant="secondary"
        >
            <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="Search files" />
                <SearchField.ClearButton />
            </SearchField.Group>
        </SearchField>
    );
}

function WorkspaceFilter({
    includeHidden,
    onIncludeHiddenChange,
    variant = 'ghost',
}: WorkspaceFilterProps & { variant?: 'ghost' | 'secondary' }) {
    return (
        <Dropdown>
            <Button
                aria-label="Filter files"
                isIconOnly
                size="sm"
                variant={includeHidden ? 'secondary' : variant}
            >
                <Icon icon={FilterHorizontalIcon} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    onSelectionChange={(keys) =>
                        onIncludeHiddenChange(keys === 'all' || keys.has('hidden'))
                    }
                    selectedKeys={includeHidden ? new Set(['hidden']) : new Set()}
                    selectionMode="multiple"
                >
                    <Dropdown.Item id="hidden" textValue="Hidden files">
                        <Dropdown.ItemIndicator />
                        <Label>Hidden files</Label>
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

function WorkspaceOptions({ selectedPath }: { selectedPath: null | string }) {
    return (
        <Dropdown>
            <Button
                aria-label="File options"
                isDisabled={!selectedPath}
                isIconOnly
                size="sm"
                variant="ghost"
            >
                <Icon icon={MoreHorizontalIcon} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    onAction={(key) => {
                        if (!selectedPath) {
                            return;
                        }
                        if (key === 'copy-link') {
                            void writeClipboardText(
                                formatHausResourceLink({
                                    kind: 'workspaceFile',
                                    path: selectedPath,
                                })
                            );
                        } else if (key === 'copy-path') {
                            void writeClipboardText(selectedPath);
                        }
                    }}
                >
                    <Dropdown.Item id="copy-link" textValue="Copy link">
                        <Icon icon={Link01Icon} size={16} />
                        <Label>Copy link</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="copy-path" textValue="Copy path">
                        <Icon icon={File01Icon} size={16} />
                        <Label>Copy path</Label>
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

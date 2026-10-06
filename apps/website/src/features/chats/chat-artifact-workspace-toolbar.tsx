import { Breadcrumbs, Button, Dropdown, Label, SearchField, Toolbar } from '@heroui/react';
import { FilterHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { createContext, type ReactNode, useContext } from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { PageToolbar } from '../shell/page-toolbar.tsx';
import { SectionBar } from '../shell/section-header.tsx';
import { PageTopbar } from '../shell/shell-topbar.tsx';
import { WorkspaceOptionsMenu } from './chat-artifact-workspace-options-menu.tsx';

interface WorkspaceFilterProps {
    includeHidden: boolean;
    onIncludeHiddenChange: (value: boolean) => void;
}

interface WorkspaceSearchProps extends WorkspaceFilterProps {
    onQueryChange: (value: string) => void;
    query: string;
}

/** Without the filter props the workspace cannot be browsed right now (its Computer
    is offline): the bar keeps the host's breadcrumb and menu sections only. */
interface WorkspacePageToolbarProps extends Partial<WorkspaceFilterProps> {
    /** The open file's view controls (Copy, Raw), clustered before the menu. */
    children?: ReactNode;
    /** Replaces the path label when the host owns the bar's start (breadcrumb).
        A host breadcrumb ends with `WorkspaceRootCrumb` and `WorkspaceOpenFileCrumb`. */
    leading?: ReactNode;
    /** Host sections appended after the file sections in the bar's one "…" menu. */
    menuSections?: ReactNode;
    /** Closes the open file; the root crumb's press while a file is open. */
    onCloseFile?: () => void;
    /** `band` portals the bar into the shell band (a page that has one, like
        the Agent profile on the web); `column` draws the band's chrome in place
        over the content column, beside a full-height rail (the same page in a
        desktop tab); `page` draws its own `PageToolbar` row. */
    placement?: WorkspaceBarPlacement;
    selectedPath: null | string;
    /** Shown while no file is open; null when the host already titles the page. */
    title?: null | string;
}

export type WorkspaceBarPlacement = 'band' | 'column' | 'page';

interface OpenFile {
    close?: () => void;
    path: null | string;
}

const OpenFileContext = createContext<OpenFile>({ path: null });

/**
 * The Workspace page's one top bar, browser-style: where you are at the start
 * (the host's breadcrumb, or the open file's path), then the open file's
 * controls and one "…" menu at the end. In the shell band, or in a local
 * `SectionBar` over the content column, it sits on the band's gutter; as its
 * own row it is a `PageToolbar` with a bottom hairline.
 */
export function WorkspacePageToolbar({
    children,
    includeHidden = false,
    leading,
    onCloseFile,
    onIncludeHiddenChange,
    placement = 'page',
    selectedPath,
    title = 'Workspace',
    menuSections,
}: WorkspacePageToolbarProps) {
    const label = selectedPath ?? title;
    const start =
        leading ??
        (label ? (
            <span className="min-w-0 truncate text-muted text-sm" title={label}>
                {label}
            </span>
        ) : null);
    const tools = (
        <Toolbar aria-label="Workspace tools" className="shrink-0">
            {children}
            <WorkspaceOptionsMenu
                files={
                    onIncludeHiddenChange
                        ? { includeHidden, onIncludeHiddenChange, selectedPath }
                        : undefined
                }
                hostSections={menuSections}
            />
        </Toolbar>
    );
    const bandRow = (
        <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center">{start}</div>
            {tools}
        </div>
    );
    return (
        <OpenFileContext.Provider value={{ close: onCloseFile, path: selectedPath }}>
            {placement === 'band' ? (
                <PageTopbar>{bandRow}</PageTopbar>
            ) : placement === 'column' ? (
                <SectionBar>{bandRow}</SectionBar>
            ) : (
                <PageToolbar>
                    <div className="flex min-w-0 flex-1 items-center ps-1">{start}</div>
                    {tools}
                </PageToolbar>
            )}
        </OpenFileContext.Provider>
    );
}

/**
 * The Workspace crumb of a host breadcrumb passed as `leading`. While a file
 * is open it is a link back to the bare workspace (it closes the file), so it
 * never looks pressable without doing anything; otherwise it is the current crumb.
 */
export function WorkspaceRootCrumb({ children }: { children: ReactNode }) {
    const { close, path } = useContext(OpenFileContext);
    return <Breadcrumbs.Item onPress={path ? close : undefined}>{children}</Breadcrumbs.Item>;
}

/** The open file as the last crumb of a host breadcrumb passed as `leading`. */
export function WorkspaceOpenFileCrumb() {
    const { path } = useContext(OpenFileContext);
    return path ? <Breadcrumbs.Item>{path}</Breadcrumbs.Item> : null;
}

export function WorkspacePageRailSearch({
    onBandLine = false,
    onQueryChange,
    query,
}: Pick<WorkspaceSearchProps, 'onQueryChange' | 'query'> & {
    /** The rail tops the page beside a `column` bar: the field stands in a
        band-height row so its midline meets the bar's. */
    onBandLine?: boolean;
}) {
    return (
        <div
            className={
                onBandLine
                    ? 'flex h-[var(--app-shell-band-height)] shrink-0 items-center px-2'
                    : 'shrink-0 p-2'
            }
        >
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

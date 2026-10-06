import { Button, Dropdown, Label, type Selection, Separator, Tooltip } from '@heroui/react';
import { File01Icon, Link01Icon, MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { writeClipboardText } from '../../lib/clipboard.ts';
import { formatHausResourceLink } from './haus-resource-link.ts';

const menuIconSize = 16;
const hiddenFilesKey = 'hidden';

/** The view section's selection, as the one setting it holds. */
export function showsHiddenFiles(keys: Selection): boolean {
    return keys === 'all' || keys.has(hiddenFilesKey);
}

/**
 * The Workspace page bar's one "…" menu: the hidden-files view toggle, the
 * open file's copy actions, then any sections the host adds (the Agent
 * profile puts its lifecycle verbs here, so the bar never shows two "…").
 * Without `files` — a workspace that cannot be browsed right now — only the
 * host's sections remain, and no sections at all means no menu.
 */
export function WorkspaceOptionsMenu({
    files,
    hostSections,
}: {
    files?: {
        includeHidden: boolean;
        onIncludeHiddenChange: (value: boolean) => void;
        selectedPath: null | string;
    };
    hostSections?: ReactNode;
}) {
    if (!(files || hostSections)) {
        return null;
    }
    return (
        <Dropdown>
            <Tooltip>
                <Button aria-label="Workspace options" isIconOnly size="sm" variant="ghost">
                    <Icon icon={MoreHorizontalIcon} size={menuIconSize} />
                </Button>
                <Tooltip.Content>More options</Tooltip.Content>
            </Tooltip>
            <Dropdown.Popover placement="bottom end">
                {/* Separators state their orientation: this menu opens from a
                    Toolbar, whose context would otherwise turn them vertical. */}
                <Dropdown.Menu aria-label="Workspace options">
                    {files ? <WorkspaceFileSections {...files} /> : null}
                    {files && hostSections ? <Separator orientation="horizontal" /> : null}
                    {hostSections}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

function WorkspaceFileSections({
    includeHidden,
    onIncludeHiddenChange,
    selectedPath,
}: {
    includeHidden: boolean;
    onIncludeHiddenChange: (value: boolean) => void;
    selectedPath: null | string;
}) {
    return (
        <>
            <Dropdown.Section
                aria-label="View"
                onSelectionChange={(keys) => onIncludeHiddenChange(showsHiddenFiles(keys))}
                selectedKeys={includeHidden ? [hiddenFilesKey] : []}
                selectionMode="multiple"
            >
                <Dropdown.Item id={hiddenFilesKey} textValue="Show hidden files">
                    <Dropdown.ItemIndicator />
                    <Label>Show hidden files</Label>
                </Dropdown.Item>
            </Dropdown.Section>
            <Separator orientation="horizontal" />
            <Dropdown.Section aria-label="File">
                <Dropdown.Item
                    id="copy-link"
                    isDisabled={!selectedPath}
                    onAction={() => copyFileText(selectedPath, 'link')}
                    textValue="Copy link"
                >
                    <Icon icon={Link01Icon} size={menuIconSize} />
                    <Label>Copy link</Label>
                </Dropdown.Item>
                <Dropdown.Item
                    id="copy-path"
                    isDisabled={!selectedPath}
                    onAction={() => copyFileText(selectedPath, 'path')}
                    textValue="Copy path"
                >
                    <Icon icon={File01Icon} size={menuIconSize} />
                    <Label>Copy path</Label>
                </Dropdown.Item>
            </Dropdown.Section>
        </>
    );
}

function copyFileText(path: null | string, kind: 'link' | 'path') {
    if (!path) {
        return;
    }
    void writeClipboardText(
        kind === 'link' ? formatHausResourceLink({ kind: 'workspaceFile', path }) : path
    );
}

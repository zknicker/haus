import * as React from 'react';

import { type DesktopEditCommand, getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { cn } from '../../lib/utils.ts';

// Frosted-glass chrome that imitates the native macOS context menu — this
// menu stands in for the OS one on the Electron surface, so it follows
// platform metrics rather than app design tokens.
const contextMenuPopupClassName =
    'relative flex w-[152px] rounded-[14px] border border-black/15 bg-[#f7f7f8]/95 shadow-[0_16px_40px_rgb(0_0_0_/_0.18),0_2px_10px_rgb(0_0_0_/_0.10)] outline-none backdrop-blur-xl dark:border-white/12 dark:bg-[#2b2b2d]/92';
const contextMenuItemClassName =
    'min-h-[27px] gap-2.5 rounded-[10px] py-px ps-3 pe-3 font-normal text-sm data-highlighted:bg-accent data-highlighted:text-accent-foreground sm:min-h-[27px]';
const contextMenuSeparatorClassName = 'mx-1 my-1 bg-black/12 dark:bg-white/14';

const editableSelector =
    'input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]';
const textInputTypes = new Set(['', 'email', 'number', 'password', 'search', 'tel', 'text', 'url']);
const menuWidthPx = 152;
const editableMenuHeightPx = 222;
const selectionMenuHeightPx = 38;

interface EditContextMenuState {
    hasSelection: boolean;
    mode: 'editable' | 'selection';
    x: number;
    y: number;
}

interface ContextMenuDispositionInput {
    defaultPrevented: boolean;
    hasDesktopBridge: boolean;
    hasEditableTarget: boolean;
    hasSelection: boolean;
}

export function getContextMenuDisposition({
    defaultPrevented,
    hasDesktopBridge,
    hasEditableTarget,
    hasSelection,
}: ContextMenuDispositionInput): 'ignore' | 'show-edit-menu' | 'suppress-native' {
    if (defaultPrevented) {
        return 'ignore';
    }

    if (hasEditableTarget || hasSelection) {
        return hasDesktopBridge ? 'show-edit-menu' : 'ignore';
    }

    return 'suppress-native';
}

export function DesktopEditContextMenuProvider({
    children,
}: {
    children: React.ReactNode;
}): React.ReactElement {
    const [menu, setMenu] = React.useState<EditContextMenuState | null>(null);
    const menuRef = React.useRef<HTMLDivElement | null>(null);
    const bridge = getDesktopBridge();

    React.useEffect(() => {
        function handleContextMenu(event: MouseEvent) {
            const target = event.target instanceof Element ? event.target : null;
            const editable = findEditableTarget(target);
            const hasSelection = editable ? hasEditableSelection(editable) : hasDocumentSelection();
            const disposition = getContextMenuDisposition({
                defaultPrevented: event.defaultPrevented,
                hasDesktopBridge: Boolean(bridge),
                hasEditableTarget: Boolean(editable),
                hasSelection,
            });

            if (disposition === 'ignore') {
                return;
            }

            event.preventDefault();

            if (disposition === 'suppress-native') {
                setMenu(null);
                return;
            }

            setMenu({
                hasSelection,
                mode: editable ? 'editable' : 'selection',
                ...getMenuPosition(
                    event.clientX,
                    event.clientY,
                    editable ? editableMenuHeightPx : selectionMenuHeightPx
                ),
            });
        }

        function closeMenu(event: Event) {
            if (event.target instanceof Node && menuRef.current?.contains(event.target)) {
                return;
            }

            setMenu(null);
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setMenu(null);
            }
        }

        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('mousedown', closeMenu, true);
        document.addEventListener('scroll', closeMenu, true);
        window.addEventListener('blur', closeMenu);
        window.addEventListener('resize', closeMenu);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('mousedown', closeMenu, true);
            document.removeEventListener('scroll', closeMenu, true);
            window.removeEventListener('blur', closeMenu);
            window.removeEventListener('resize', closeMenu);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [bridge]);

    return (
        <>
            {children}
            {menu ? (
                <div className="fixed z-50" ref={menuRef} style={{ left: menu.x, top: menu.y }}>
                    <div className={contextMenuPopupClassName}>
                        <div className="max-h-(--available-height) w-full overflow-y-auto p-1">
                            {menu.mode === 'editable' ? (
                                <EditableMenuItems
                                    hasSelection={menu.hasSelection}
                                    onCommand={async (command) => {
                                        setMenu(null);
                                        await runEditCommand(command);
                                    }}
                                />
                            ) : (
                                <EditContextMenuItem
                                    command="copy"
                                    onCommand={async (command) => {
                                        setMenu(null);
                                        await runEditCommand(command);
                                    }}
                                >
                                    Copy
                                </EditContextMenuItem>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}

function EditableMenuItems({
    hasSelection,
    onCommand,
}: {
    hasSelection: boolean;
    onCommand: (command: DesktopEditCommand) => Promise<void>;
}) {
    return (
        <>
            <EditContextMenuItem command="undo" onCommand={onCommand}>
                Undo
            </EditContextMenuItem>
            <EditContextMenuItem command="redo" onCommand={onCommand}>
                Redo
            </EditContextMenuItem>
            <EditContextMenuSeparator />
            <EditContextMenuItem command="cut" disabled={!hasSelection} onCommand={onCommand}>
                Cut
            </EditContextMenuItem>
            <EditContextMenuItem command="copy" disabled={!hasSelection} onCommand={onCommand}>
                Copy
            </EditContextMenuItem>
            <EditContextMenuItem command="paste" onCommand={onCommand}>
                Paste
            </EditContextMenuItem>
            <EditContextMenuSeparator />
            <EditContextMenuItem command="selectAll" onCommand={onCommand}>
                Select All
            </EditContextMenuItem>
        </>
    );
}

function EditContextMenuItem({
    children,
    command,
    disabled,
    onCommand,
}: {
    children: React.ReactNode;
    command: DesktopEditCommand;
    disabled?: boolean;
    onCommand: (command: DesktopEditCommand) => Promise<void>;
}) {
    const [highlighted, setHighlighted] = React.useState(false);

    return (
        <button
            className={cn(
                'text-foreground flex w-full cursor-default items-center text-left outline-none select-none disabled:pointer-events-none disabled:opacity-50',
                contextMenuItemClassName
            )}
            data-highlighted={highlighted ? '' : undefined}
            disabled={disabled}
            onClick={() => {
                void onCommand(command);
            }}
            onFocus={() => setHighlighted(true)}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setHighlighted(true)}
            onMouseLeave={() => setHighlighted(false)}
            type="button"
        >
            {children}
        </button>
    );
}

function EditContextMenuSeparator() {
    return <div className={cn('h-px', contextMenuSeparatorClassName)} />;
}

async function runEditCommand(command: DesktopEditCommand) {
    const bridge = getDesktopBridge();

    if (bridge) {
        await bridge.runEditCommand(command);
        return;
    }

    document.execCommand(command);
}

function findEditableTarget(target: Element | null) {
    const editable = target?.closest(editableSelector);

    if (editable instanceof HTMLTextAreaElement) {
        return editable.disabled || editable.readOnly ? null : editable;
    }

    if (editable instanceof HTMLInputElement) {
        return editable.disabled || editable.readOnly || !textInputTypes.has(editable.type)
            ? null
            : editable;
    }

    if (editable instanceof HTMLElement && editable.isContentEditable) {
        return editable;
    }

    return null;
}

function hasEditableSelection(editable: Element) {
    if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
        return (
            typeof editable.selectionStart === 'number' &&
            typeof editable.selectionEnd === 'number' &&
            editable.selectionStart !== editable.selectionEnd
        );
    }

    return hasDocumentSelection();
}

function hasDocumentSelection() {
    const selection = window.getSelection();
    return Boolean(selection && !selection.isCollapsed && selection.toString().length > 0);
}

function getMenuPosition(clientX: number, clientY: number, menuHeight: number) {
    return {
        x: Math.max(0, Math.min(clientX, window.innerWidth - menuWidthPx - 8)),
        y: Math.max(0, Math.min(clientY, window.innerHeight - menuHeight - 8)),
    };
}

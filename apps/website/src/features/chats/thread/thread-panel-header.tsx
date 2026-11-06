import { Button, Dropdown, Label, Tooltip, toast } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import {
    ArrowDown01Icon,
    ArrowLeft01Icon,
    ArrowUpRight01Icon,
    CheckmarkCircle02Icon,
    Copy01Icon,
    Notification01Icon,
    NotificationOff01Icon,
    PlusSignIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { useSetThreadClosed, useThreadClosure } from '../../../hooks/threads/use-open-threads.ts';
import { writeClipboardText } from '../../../lib/clipboard.ts';
import { bandHeightClassName, shellBandIconSize } from '../../shell/section-header.tsx';
import { PageTopbar } from '../../shell/shell-topbar.tsx';

export function ThreadPanelHeader({
    actions,
    bandHosted = false,
    followed,
    followPending,
    header,
    onBack,
    onClose,
    onFollowChange,
    onViewInChannel,
    serverId,
    target,
    takeover,
    threadChatId,
}: {
    /** Page-level controls at the band's trailing end. */
    actions?: React.ReactNode;
    /** Fill the shell's band rather than drawing its own: the web's Thread page. */
    bandHosted?: boolean;
    followed: boolean;
    followPending: boolean;
    header: string;
    onBack?: () => void;
    /** Absent when the host closes the Thread itself (a workspace tab's own close button). */
    onClose?: () => void;
    onFollowChange: (follow: boolean) => void;
    onViewInChannel: () => void;
    serverId: string;
    target: null | string;
    takeover: boolean;
    threadChatId: string | undefined;
}) {
    const closure = useThreadClosure(serverId, threadChatId);
    const setClosed = useSetThreadClosed();
    const threadExists = threadChatId !== undefined;
    const runAction = (key: React.Key) => {
        if (key === 'view') {
            onViewInChannel();
            return;
        }
        if (key === 'follow') {
            onFollowChange(!followed);
            return;
        }
        if (key === 'closure' && threadChatId) {
            setClosed.mutate({ closed: closure === 'open', serverId, threadChatId });
            return;
        }
        if (key === 'copy' && target) {
            writeClipboardText(target)
                .then(() => toast.success('Reference copied'))
                .catch(() => toast.danger('Could not copy the thread reference'));
        }
    };

    const row = (
        <>
            {takeover && onBack ? (
                <Tooltip>
                    <Button
                        aria-label="Back to chat"
                        isIconOnly
                        onPress={onBack}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={ArrowLeft01Icon} size={shellBandIconSize} />
                    </Button>
                    <Tooltip.Content>Back to chat</Tooltip.Content>
                </Tooltip>
            ) : null}
            {/* The name is the menu, mirroring the chat topbar: one control
                on the leading edge, and the trailing edge keeps only close. */}
            <div className="flex min-w-0 flex-1 items-center">
                <ContextMenu>
                    <ContextMenu.Trigger className="min-w-0">
                        <Dropdown>
                            <Button
                                aria-label={`${header} — thread actions`}
                                className="-ms-2 min-w-0 gap-2 px-2"
                                size="sm"
                                variant="ghost"
                            >
                                <span className="truncate font-semibold text-sm">{header}</span>
                                <Icon
                                    aria-hidden="true"
                                    className="text-muted"
                                    icon={ArrowDown01Icon}
                                    size={15}
                                />
                            </Button>
                            <Dropdown.Popover placement="bottom start">
                                <Dropdown.Menu onAction={runAction}>
                                    <ThreadDropdownItems
                                        closure={closure}
                                        followed={followed}
                                        followPending={followPending}
                                        target={target}
                                        threadExists={threadExists}
                                    />
                                </Dropdown.Menu>
                            </Dropdown.Popover>
                        </Dropdown>
                    </ContextMenu.Trigger>
                    <ContextMenu.Popover>
                        <ContextMenu.Menu onAction={runAction}>
                            <ContextMenu.Item id="view" textValue="View in chat">
                                <Icon icon={ArrowUpRight01Icon} size={16} />
                                <Label>View in chat</Label>
                            </ContextMenu.Item>
                            <ContextMenu.Item
                                id="copy"
                                isDisabled={!target}
                                textValue="Copy reference"
                            >
                                <Icon icon={Copy01Icon} size={16} />
                                <Label>Copy reference</Label>
                            </ContextMenu.Item>
                            <ContextMenu.Item
                                id="follow"
                                isDisabled={!threadExists || followPending}
                                textValue={followed ? 'Stop following thread' : 'Follow thread'}
                            >
                                <Icon
                                    icon={followed ? NotificationOff01Icon : Notification01Icon}
                                    size={16}
                                />
                                <Label>
                                    {followed ? 'Stop following thread' : 'Follow thread'}
                                </Label>
                            </ContextMenu.Item>
                            {closure ? (
                                <ContextMenu.Item id="closure" textValue={closureLabel(closure)}>
                                    <Icon icon={CheckmarkCircle02Icon} size={16} />
                                    <Label>{closureLabel(closure)}</Label>
                                </ContextMenu.Item>
                            ) : null}
                        </ContextMenu.Menu>
                    </ContextMenu.Popover>
                </ContextMenu>
            </div>
            {actions}
            {onClose ? (
                <Tooltip>
                    <Button
                        aria-label="Close thread"
                        isIconOnly
                        onPress={onClose}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon
                            aria-hidden="true"
                            className="rotate-45"
                            icon={PlusSignIcon}
                            size={shellBandIconSize}
                        />
                    </Button>
                    <Tooltip.Content>Close thread</Tooltip.Content>
                </Tooltip>
            ) : null}
        </>
    );
    return bandHosted ? (
        <PageTopbar>
            <div className="flex min-w-0 flex-1 items-center gap-3">{row}</div>
        </PageTopbar>
    ) : (
        <header className={`flex ${bandHeightClassName} shrink-0 items-center gap-3 px-5`}>
            {row}
        </header>
    );
}

function closureLabel(closure: 'closed' | 'open') {
    return closure === 'open' ? 'Close' : 'Reopen';
}

function ThreadDropdownItems({
    closure,
    followed,
    followPending,
    target,
    threadExists,
}: {
    closure: 'closed' | 'open' | null;
    followed: boolean;
    followPending: boolean;
    target: null | string;
    threadExists: boolean;
}) {
    return (
        <>
            <Dropdown.Item id="view" textValue="View in chat">
                <Icon icon={ArrowUpRight01Icon} size={16} />
                <Label>View in chat</Label>
            </Dropdown.Item>
            <Dropdown.Item id="copy" isDisabled={!target} textValue="Copy reference">
                <Icon icon={Copy01Icon} size={16} />
                <Label>Copy reference</Label>
            </Dropdown.Item>
            <Dropdown.Item
                id="follow"
                isDisabled={!threadExists || followPending}
                textValue={followed ? 'Stop following thread' : 'Follow thread'}
            >
                <Icon icon={followed ? NotificationOff01Icon : Notification01Icon} size={16} />
                <Label>{followed ? 'Stop following thread' : 'Follow thread'}</Label>
            </Dropdown.Item>
            {closure ? (
                <Dropdown.Item id="closure" textValue={closureLabel(closure)}>
                    <Icon icon={CheckmarkCircle02Icon} size={16} />
                    <Label>{closureLabel(closure)}</Label>
                </Dropdown.Item>
            ) : null}
        </>
    );
}

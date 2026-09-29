import type { Chat } from '@haus/api';
import { Dropdown, Header, Label, Separator } from '@heroui/react';
import {
    ArchiveIcon,
    ArchiveRestoreIcon,
    Delete02Icon,
    Edit02Icon,
    PaintBrush03Icon,
    UserMultiple02Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { ChatSurfaceItems } from './chat-surface-items.tsx';

export function ChannelActionsMenu({
    chat,
    count,
    canManage,
    lifecyclePending,
    onAction,
}: {
    chat: Chat;
    count: number;
    canManage: boolean;
    lifecyclePending: boolean;
    onAction: (key: React.Key) => void;
}) {
    return (
        <Dropdown.Menu onAction={onAction}>
            <Dropdown.Section>
                <Header>Channel</Header>
                <Dropdown.Item
                    id="rename"
                    isDisabled={Boolean(chat.archivedAt)}
                    textValue="Rename channel"
                >
                    <Icon aria-hidden="true" icon={Edit02Icon} size={16} />
                    <Label>Rename channel</Label>
                </Dropdown.Item>
                <Dropdown.Item
                    id="appearance"
                    isDisabled={Boolean(chat.archivedAt)}
                    textValue="Icon and color"
                >
                    <Icon aria-hidden="true" icon={PaintBrush03Icon} size={16} />
                    <Label>Icon &amp; color</Label>
                </Dropdown.Item>
                <Dropdown.Item id="agents" isDisabled={Boolean(chat.archivedAt)} textValue="Agents">
                    <Icon aria-hidden="true" icon={UserMultiple02Icon} size={16} />
                    <Label>Agents</Label>
                    <span className="ms-auto shrink-0 text-muted text-xs tabular-nums">
                        {count}
                    </span>
                </Dropdown.Item>
            </Dropdown.Section>
            <Separator />
            <Dropdown.Section>
                <Header>Content</Header>
                <ChatSurfaceItems />
            </Dropdown.Section>
            {chat.isAll || !canManage ? null : (
                <>
                    <Separator />
                    <Dropdown.Section>
                        <Header>Actions</Header>
                        <Dropdown.Item
                            id={chat.archivedAt ? 'restore' : 'archive'}
                            isDisabled={lifecyclePending}
                            textValue={chat.archivedAt ? 'Restore channel' : 'Archive channel'}
                        >
                            <Icon
                                icon={chat.archivedAt ? ArchiveRestoreIcon : ArchiveIcon}
                                size={16}
                            />
                            <Label>{chat.archivedAt ? 'Restore channel' : 'Archive channel'}</Label>
                        </Dropdown.Item>
                        <Dropdown.Item
                            id="delete"
                            isDisabled={lifecyclePending}
                            textValue="Delete channel"
                            variant="danger"
                        >
                            <Icon icon={Delete02Icon} size={16} />
                            <Label>Delete channel</Label>
                        </Dropdown.Item>
                    </Dropdown.Section>
                </>
            )}
        </Dropdown.Menu>
    );
}

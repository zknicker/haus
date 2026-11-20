import type { Chat } from '@haus/api';
import { Dropdown, Header, Label, Separator } from '@heroui/react';
import {
    ArchiveIcon,
    ArchiveRestoreIcon,
    Delete02Icon,
    Edit02Icon,
    PaintBrush03Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { ChatSurfaceItems } from './chat-surface-items.tsx';

export function ChannelActionsMenu({
    chat,
    canManage,
    lifecyclePending,
    onAction,
}: {
    chat: Chat;
    canManage: boolean;
    lifecyclePending: boolean;
    onAction: (key: React.Key) => void;
}) {
    return (
        <Dropdown.Menu onAction={onAction}>
            <Dropdown.Section>
                <Header>Project</Header>
                <Dropdown.Item
                    id="rename"
                    isDisabled={Boolean(chat.archivedAt)}
                    textValue="Name and description"
                >
                    <Icon aria-hidden="true" icon={Edit02Icon} size={16} />
                    <Label>Name &amp; description…</Label>
                </Dropdown.Item>
                <Dropdown.Item
                    id="appearance"
                    isDisabled={Boolean(chat.archivedAt)}
                    textValue="Icon and color"
                >
                    <Icon aria-hidden="true" icon={PaintBrush03Icon} size={16} />
                    <Label>Icon &amp; color</Label>
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
                            textValue={chat.archivedAt ? 'Restore project' : 'Archive project'}
                        >
                            <Icon
                                icon={chat.archivedAt ? ArchiveRestoreIcon : ArchiveIcon}
                                size={16}
                            />
                            <Label>{chat.archivedAt ? 'Restore project' : 'Archive project'}</Label>
                        </Dropdown.Item>
                        <Dropdown.Item
                            id="delete"
                            isDisabled={lifecyclePending}
                            textValue="Delete project"
                            variant="danger"
                        >
                            <Icon icon={Delete02Icon} size={16} />
                            <Label>Delete project</Label>
                        </Dropdown.Item>
                    </Dropdown.Section>
                </>
            )}
        </Dropdown.Menu>
    );
}

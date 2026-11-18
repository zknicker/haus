import { Chip } from '@heroui/react';
import {
    BubbleChatIcon,
    HashtagIcon,
    MessageMultiple02Icon,
    UserMultiple02Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { IconSvgElement } from '@hugeicons/react';
import type * as React from 'react';

import { cn } from '../../lib/utils.ts';
import { Icon } from '../ui/icon.tsx';

export type ChatBadgeKind = 'channel' | 'direct' | 'group' | 'topic';

export interface ChatBadgeProps {
    className?: string;
    kind: ChatBadgeKind;
    title: string;
}

const KIND_ICON: Record<ChatBadgeKind, IconSvgElement> = {
    channel: HashtagIcon,
    direct: BubbleChatIcon,
    group: UserMultiple02Icon,
    topic: MessageMultiple02Icon,
};

export function ChatBadge({ className, kind, title }: ChatBadgeProps): React.ReactElement {
    return (
        <Chip
            className={cn('min-w-0', className)}
            data-slot="chat-badge"
            title={title}
            variant="secondary"
        >
            <Icon className="text-muted shrink-0" icon={KIND_ICON[kind]} size={14} />
            <Chip.Label className="min-w-0 truncate">{title}</Chip.Label>
        </Chip>
    );
}

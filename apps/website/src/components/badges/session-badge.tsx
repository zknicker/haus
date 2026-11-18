import { Chip } from '@heroui/react';
import { Layers02Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';

import { cn } from '../../lib/utils.ts';
import { Icon } from '../ui/icon.tsx';

export interface SessionBadgeProps {
    className?: string;
    sessionKey: string;
}

export function SessionBadge({ className, sessionKey }: SessionBadgeProps): React.ReactElement {
    return (
        <Chip
            className={cn('min-w-0', className)}
            data-slot="session-badge"
            title={sessionKey}
            variant="secondary"
        >
            <Icon className="text-muted shrink-0" icon={Layers02Icon} size={14} />
            <Chip.Label className="min-w-0 truncate font-mono">{sessionKey}</Chip.Label>
        </Chip>
    );
}

import { parseChatThreadReferenceTarget } from '@haus/api';
import type * as React from 'react';
import { ReferenceChipView } from './reference-chip-view.tsx';
import { TaskReferenceChip } from './task-reference-chip.tsx';
import { ThreadReferenceChip } from './thread-reference-chip.tsx';

export function ReferenceChip(props: React.ComponentProps<typeof ReferenceChipView>) {
    const thread = props.kind === 'chat' ? parseChatThreadReferenceTarget(props.id) : null;
    if (thread && props.serverId) {
        return <ThreadReferenceChip {...props} serverId={props.serverId} thread={thread} />;
    }
    return props.kind === 'task' && props.serverId ? (
        <TaskReferenceChip {...props} serverId={props.serverId} />
    ) : (
        <ReferenceChipView {...props} />
    );
}

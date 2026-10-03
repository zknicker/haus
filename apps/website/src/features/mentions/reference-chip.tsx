import { parseChatThreadReferenceTarget } from '@haus/api';
import type * as React from 'react';
import { ReferenceChipView } from './reference-chip-view.tsx';
import { ThreadReferenceChip } from './thread-reference-chip.tsx';

export function ReferenceChip(props: React.ComponentProps<typeof ReferenceChipView>) {
    const thread = props.kind === 'chat' ? parseChatThreadReferenceTarget(props.id) : null;
    return thread && props.serverId ? (
        <ThreadReferenceChip {...props} serverId={props.serverId} thread={thread} />
    ) : (
        <ReferenceChipView {...props} />
    );
}

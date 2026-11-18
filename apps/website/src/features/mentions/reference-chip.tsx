import type * as React from 'react';

import { ReferenceChipView } from './reference-chip-view.tsx';
import { TaskReferenceChip } from './task-reference-chip.tsx';

export function ReferenceChip(props: React.ComponentProps<typeof ReferenceChipView>) {
    return props.kind === 'task' && props.serverId ? (
        <TaskReferenceChip {...props} serverId={props.serverId} />
    ) : (
        <ReferenceChipView {...props} />
    );
}

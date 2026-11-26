import { parseTaskReferenceTarget } from '@haus/api';
import { toast } from '@heroui/react';
import type * as React from 'react';
import { useOpenTaskReference } from '../../hooks/tasks/use-open-task-reference.ts';
import { ReferenceChipView } from './reference-chip-view.tsx';
import { TaskHoverCardContent } from './task-hover-card.tsx';
import { readTaskLink } from './task-reference-scan.ts';

/**
 * A Task reference: the tertiary chip, which opens the Task and previews it on
 * hover. A chip reads nothing to render; a transcript of Task links would
 * otherwise fan out one read per chip, so the card reads when it opens.
 */
export function TaskReferenceChip({
    serverId,
    ...props
}: React.ComponentProps<typeof ReferenceChipView> & { serverId: string }) {
    const open = useOpenTaskReference(serverId);
    const ref = parseTaskReferenceTarget(props.id);
    if (!ref) {
        return <ReferenceChipView {...props} serverId={serverId} />;
    }
    const link = readTaskLink(props.metadata);
    const taskId = link.taskId ?? ref;
    return (
        <ReferenceChipView
            {...props}
            onActivate={() => {
                open({ ...(link.shortId ? { shortId: link.shortId } : {}), taskId }).catch(() =>
                    toast.danger(`Could not open ${props.label}`)
                );
            }}
            preview={false}
            previewContent={
                props.preview ? (
                    <TaskHoverCardContent
                        displayLabel={props.label}
                        serverId={serverId}
                        taskId={taskId}
                    />
                ) : undefined
            }
            serverId={serverId}
        />
    );
}

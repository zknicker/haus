import { TASK_DESCRIPTION_MAX_CHARS, type TaskDetail } from '@haus/api';
import { Button, TextArea, TextField } from '@heroui/react';
import * as React from 'react';
import { useUpdateTask } from '../../hooks/tasks/use-update-task.ts';
import { ReferenceMarkdown } from '../mentions/reference-markdown.tsx';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';

/**
 * The markdown description, rendered until the reader asks to edit. The source
 * edits as text: it is what an Agent reads and writes too, and a file attaches
 * by a link in it.
 */
export function TaskDescription({ task }: { task: TaskDetail }) {
    const update = useUpdateTask();
    const [draft, setDraft] = React.useState<null | string>(null);

    if (draft === null) {
        return (
            <div className="flex flex-col items-start gap-2">
                {task.description ? (
                    <ReferenceMarkdown content={task.description} serverId={task.serverId} />
                ) : null}
                <Button onPress={() => setDraft(task.description)} size="sm" variant="ghost">
                    {task.description ? 'Edit description' : 'Add description'}
                </Button>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2">
            <TextField aria-label="Description" fullWidth onChange={setDraft} value={draft}>
                <TextArea autoFocus maxLength={TASK_DESCRIPTION_MAX_CHARS} rows={8} />
            </TextField>
            <SettingsRowError>{update.error?.message}</SettingsRowError>
            <div className="flex items-center gap-2">
                <Button
                    isPending={update.isPending}
                    onPress={() =>
                        update.mutate(
                            {
                                expectedVersion: task.version,
                                patch: { description: draft },
                                serverId: task.serverId,
                                taskId: task.id,
                            },
                            { onSuccess: () => setDraft(null) }
                        )
                    }
                    size="sm"
                >
                    Save
                </Button>
                <Button
                    onPress={() => {
                        update.reset();
                        setDraft(null);
                    }}
                    size="sm"
                    variant="ghost"
                >
                    Cancel
                </Button>
            </div>
        </div>
    );
}

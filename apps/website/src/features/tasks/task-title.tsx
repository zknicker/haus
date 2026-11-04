import { TASK_TITLE_MAX_CHARS, type TaskDetail } from '@haus/api';
import { Input, TextField } from '@heroui/react';
import * as React from 'react';
import { useUpdateTask } from '../../hooks/tasks/use-update-task.ts';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';

/** The title as the page's heading; pressing it edits in place. Enter or blur saves, Escape leaves. */
export function TaskTitle({ task }: { task: TaskDetail }) {
    const update = useUpdateTask();
    const [draft, setDraft] = React.useState<null | string>(null);
    // Leaving unmounts the focused input, and a browser may fire its blur on the way out.
    const leaving = React.useRef(false);

    const commit = () => {
        const title = draft?.trim();
        setDraft(null);
        if (title && title !== task.title && !leaving.current) {
            update.mutate({
                expectedVersion: task.version,
                patch: { title },
                serverId: task.serverId,
                taskId: task.id,
            });
        }
    };

    if (draft !== null) {
        return (
            <TextField aria-label="Title" fullWidth onChange={setDraft} value={draft}>
                <Input
                    autoFocus
                    maxLength={TASK_TITLE_MAX_CHARS}
                    onBlur={commit}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.currentTarget.blur();
                        } else if (event.key === 'Escape') {
                            leaving.current = true;
                            setDraft(null);
                        }
                    }}
                />
            </TextField>
        );
    }
    return (
        <div>
            <h1 className="font-semibold text-2xl text-foreground tracking-tight">
                <button
                    className="cursor-text text-left"
                    onClick={() => {
                        leaving.current = false;
                        setDraft(task.title);
                    }}
                    type="button"
                >
                    {task.title}
                </button>
            </h1>
            <SettingsRowError>{update.error?.message}</SettingsRowError>
        </div>
    );
}

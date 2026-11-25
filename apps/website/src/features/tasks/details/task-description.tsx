import { TASK_DESCRIPTION_MAX_CHARS, type TaskDetail } from '@haus/api';
import { Button, Disclosure, TextArea, TextField } from '@heroui/react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useUpdateTask } from '../../../hooks/tasks/use-update-task.ts';
import { ReferenceMarkdown } from '../../mentions/reference-markdown.tsx';
import { readReferenceMentions } from '../../mentions/reference-mentions.ts';
import { useReferenceDirectory } from '../../mentions/use-reference-directory.ts';
import { useChatReferenceActivation } from '../../servers/chat/use-chat-reference-activation.ts';
import { useServerContext } from '../../servers/server-context.ts';
import { serverChatRoute } from '../../servers/server-routes.ts';
import { SettingsRowError } from '../../settings/layout/settings-text.tsx';

type DescribedTask = Pick<
    TaskDetail,
    'description' | 'descriptionContent' | 'descriptionTaskLinks' | 'id' | 'serverId' | 'version'
>;

export function TaskDescription({ task }: { task: DescribedTask }) {
    const [draft, setDraft] = React.useState<null | string>(null);

    if (draft !== null) {
        return <DescriptionEditor draft={draft} onDraftChange={setDraft} task={task} />;
    }
    if (!task.description) {
        return (
            <Button
                className="task-description-add"
                onPress={() => setDraft('')}
                size="sm"
                variant="ghost"
            >
                Add description
            </Button>
        );
    }
    return (
        <Disclosure aria-label="Description" className="task-rail-section" defaultExpanded>
            <Disclosure.Heading>
                <Button size="sm" slot="trigger" variant="ghost">
                    Description
                    <Disclosure.Indicator />
                </Button>
            </Disclosure.Heading>
            <Disclosure.Content>
                <Disclosure.Body className="task-description-body">
                    <DescriptionBody task={task} />
                    <Button onPress={() => setDraft(task.description)} size="sm" variant="ghost">
                        Edit description
                    </Button>
                </Disclosure.Body>
            </Disclosure.Content>
        </Disclosure>
    );
}

function DescriptionEditor({
    draft,
    onDraftChange,
    task,
}: {
    draft: string;
    onDraftChange: (draft: null | string) => void;
    task: DescribedTask;
}) {
    const update = useUpdateTask();
    return (
        <div className="flex flex-col gap-2">
            <TextField aria-label="Description" fullWidth onChange={onDraftChange} value={draft}>
                <TextArea autoFocus maxLength={TASK_DESCRIPTION_MAX_CHARS} rows={6} />
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
                            { onSuccess: () => onDraftChange(null) }
                        )
                    }
                    size="sm"
                >
                    Save
                </Button>
                <Button onPress={() => onDraftChange(null)} size="sm" variant="ghost">
                    Cancel
                </Button>
            </div>
        </div>
    );
}

export function DescriptionBody({ task }: { task: DescribedTask }) {
    const { server } = useServerContext();
    const navigate = useNavigate();
    const directory = useReferenceDirectory(task.serverId);
    const activateReference = useChatReferenceActivation((chatId) =>
        navigate(serverChatRoute(server.slug, chatId))
    );
    const mentions = readReferenceMentions(
        task.descriptionContent,
        task.descriptionTaskLinks,
        directory
    );

    return (
        <ReferenceMarkdown
            content={task.descriptionContent}
            mentions={mentions}
            onReferenceActivate={activateReference}
            previewReferences
            serverId={task.serverId}
        />
    );
}

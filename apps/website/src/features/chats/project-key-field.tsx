import type { Chat } from '@haus/api';
import { Description, FieldError, Input, Label, TextField } from '@heroui/react';
import * as React from 'react';
import { useProjects } from '../../hooks/projects/use-projects.ts';
import { normalizeProjectKey, projectKeyIssue } from './project-key.ts';

export function useProjectKeyDraft(chat: Chat) {
    const project = useProjects(chat.serverId).data?.find(
        (candidate) => candidate.chatId === chat.id
    );
    const [typed, setTyped] = React.useState<string | null>(null);
    const key = typed ?? project?.key ?? '';
    const changed = project !== undefined && key !== project.key;
    return {
        changed,
        key,
        project,
        savable: !changed || (key.length > 0 && projectKeyIssue(key) === null),
        setKey: (value: string) => setTyped(normalizeProjectKey(value)),
    };
}

export type ProjectKeyDraft = ReturnType<typeof useProjectKeyDraft>;

export function ProjectKeyField({
    draft,
    isPending,
    onChange,
    refusal,
}: {
    draft: ProjectKeyDraft;
    isPending: boolean;
    onChange: (value: string) => void;
    refusal: string | null;
}) {
    const { key, project } = draft;
    const issue = projectKeyIssue(key) ?? refusal;
    const fixed = project !== undefined && !project.keyEditable;

    return (
        <TextField
            fullWidth
            isDisabled={isPending || !project}
            isInvalid={Boolean(issue)}
            isReadOnly={fixed}
            onChange={onChange}
            value={key}
            variant="secondary"
        >
            <Label>Key</Label>
            <Input placeholder="OPS" type="text" />
            {issue ? <FieldError>{issue}</FieldError> : null}
            {!issue && fixed ? (
                <Description>Tasks already carry this key, so it stays.</Description>
            ) : null}
        </TextField>
    );
}

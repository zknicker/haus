import { Button, Form, Input, Label, Modal, TextArea, TextField } from '@heroui/react';
import * as React from 'react';
import { useCreateIssue } from '../../hooks/issues/use-issue-mutations.ts';
import { ProjectSelect } from '../chats/project-select.tsx';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';

export function NewIssueDialog({
    initialProjectId,
    onClose,
    onCreated,
    open,
    serverId,
}: {
    initialProjectId: null | string;
    onClose: () => void;
    onCreated: (code: string) => void;
    open: boolean;
    serverId: string;
}) {
    return (
        <Modal.Backdrop
            isDismissable
            isOpen={open}
            onOpenChange={(nextOpen) => !nextOpen && onClose()}
        >
            <Modal.Container>
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    {open ? (
                        <NewIssueForm
                            initialProjectId={initialProjectId}
                            onCreated={onCreated}
                            serverId={serverId}
                        />
                    ) : null}
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

function NewIssueForm({
    initialProjectId,
    onCreated,
    serverId,
}: {
    initialProjectId: null | string;
    onCreated: (code: string) => void;
    serverId: string;
}) {
    const create = useCreateIssue();
    const [title, setTitle] = React.useState('');
    const [description, setDescription] = React.useState('');
    const [projectId, setProjectId] = React.useState(initialProjectId);
    const formId = React.useId();
    const canSubmit = title.trim().length > 0 && projectId !== null && !create.isPending;

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!(canSubmit && projectId)) {
            return;
        }
        create.mutate(
            {
                description: description.trim(),
                projectId,
                serverId,
                title: title.trim(),
            },
            { onSuccess: ({ issue }) => onCreated(issue.code) }
        );
    };

    return (
        <>
            <Modal.Header>
                <Modal.Heading>New issue</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
                <Form className="flex flex-col gap-4" id={formId} onSubmit={submit}>
                    <TextField fullWidth onChange={setTitle} value={title} variant="secondary">
                        <Label>Title</Label>
                        <Input autoFocus placeholder="What needs doing" />
                    </TextField>
                    <ProjectSelect
                        aria-label="Project"
                        fullWidth
                        onSelect={setProjectId}
                        serverId={serverId}
                        value={projectId}
                    />
                    <TextField
                        fullWidth
                        onChange={setDescription}
                        value={description}
                        variant="secondary"
                    >
                        <Label>Description</Label>
                        <TextArea placeholder="Add a description" rows={4} />
                    </TextField>
                    <SettingsRowError>{create.error?.message ?? null}</SettingsRowError>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button slot="close" type="button" variant="secondary">
                    Cancel
                </Button>
                <Button
                    form={formId}
                    isDisabled={!canSubmit}
                    isPending={create.isPending}
                    type="submit"
                >
                    Create issue
                </Button>
            </Modal.Footer>
        </>
    );
}

import { ISSUE_COMMENT_MAX_CHARS } from '@haus/api';
import { Button, Form, TextArea, TextField } from '@heroui/react';
import * as React from 'react';
import { useCommentIssue } from '../../hooks/issues/use-issue-mutations.ts';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';

export function IssueCommentBox({ issueId, serverId }: { issueId: string; serverId: string }) {
    const comment = useCommentIssue();
    const [body, setBody] = React.useState('');
    const canSend = body.trim().length > 0 && !comment.isPending;
    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSend) {
            return;
        }
        comment.mutate({ body: body.trim(), issueId, serverId }, { onSuccess: () => setBody('') });
    };
    return (
        <Form className="issue-comment-box" onSubmit={submit}>
            <TextField aria-label="Leave a comment" fullWidth onChange={setBody} value={body}>
                <TextArea
                    maxLength={ISSUE_COMMENT_MAX_CHARS}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                            event.currentTarget.form?.requestSubmit();
                        }
                    }}
                    placeholder="Leave a comment"
                    rows={3}
                />
            </TextField>
            <SettingsRowError>{comment.error?.message ?? null}</SettingsRowError>
            <div className="flex justify-end">
                <Button isDisabled={!canSend} isPending={comment.isPending} size="sm" type="submit">
                    Comment
                </Button>
            </div>
        </Form>
    );
}

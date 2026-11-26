import { ISSUE_DESCRIPTION_MAX_CHARS, type Issue } from '@haus/api';
import { Button, TextArea, TextField } from '@heroui/react';
import * as React from 'react';
import { ReferenceMarkdown } from '../mentions/reference-markdown.tsx';
import { readReferenceMentions } from '../mentions/reference-mentions.ts';
import { useReferenceDirectory } from '../mentions/use-reference-directory.ts';
import { useIssuePatch } from './use-issue-patch.ts';

export function IssueDescription({ issue }: { issue: Issue }) {
    const [draft, setDraft] = React.useState<null | string>(null);
    if (draft !== null) {
        return <DescriptionEditor draft={draft} issue={issue} onDraftChange={setDraft} />;
    }
    if (!issue.description) {
        return (
            <Button className="self-start" onPress={() => setDraft('')} size="sm" variant="ghost">
                Add description
            </Button>
        );
    }
    return (
        <div className="issue-description">
            <DescriptionBody issue={issue} />
            <Button
                className="self-start"
                onPress={() => setDraft(issue.description)}
                size="sm"
                variant="ghost"
            >
                Edit description
            </Button>
        </div>
    );
}

function DescriptionBody({ issue }: { issue: Issue }) {
    const directory = useReferenceDirectory(issue.serverId);
    const mentions = readReferenceMentions(issue.description, [], directory);
    return (
        <ReferenceMarkdown
            content={issue.description}
            mentions={mentions}
            serverId={issue.serverId}
        />
    );
}

function DescriptionEditor({
    draft,
    issue,
    onDraftChange,
}: {
    draft: string;
    issue: Issue;
    onDraftChange: (draft: null | string) => void;
}) {
    const patch = useIssuePatch();
    const [saving, setSaving] = React.useState(false);
    return (
        <div className="flex flex-col gap-2">
            <TextField aria-label="Description" fullWidth onChange={onDraftChange} value={draft}>
                <TextArea autoFocus maxLength={ISSUE_DESCRIPTION_MAX_CHARS} rows={6} />
            </TextField>
            <div className="flex items-center gap-2">
                <Button
                    isPending={saving}
                    onPress={() => {
                        setSaving(true);
                        patch(
                            issue,
                            { description: draft },
                            {
                                onSettled: () => setSaving(false),
                                onSuccess: () => onDraftChange(null),
                            }
                        );
                    }}
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

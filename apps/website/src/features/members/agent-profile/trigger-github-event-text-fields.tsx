import { Input, Label, TextField } from '@heroui/react';
import type { GithubEventDraft, githubEventTextFields } from './trigger-github-events-model.ts';

export function EventTextFields({
    draft,
    fields,
    isDisabled,
    onChange,
}: {
    draft: GithubEventDraft;
    fields: ReturnType<typeof githubEventTextFields>;
    isDisabled: boolean;
    onChange: (draft: GithubEventDraft) => void;
}) {
    return fields.map((text) => (
        <TextField
            fullWidth
            isDisabled={isDisabled}
            key={text.key}
            onChange={(value) =>
                onChange({ ...draft, texts: { ...draft.texts, [text.key]: value } })
            }
            value={draft.texts[text.key] ?? ''}
            variant="secondary"
        >
            <Label>{text.label}</Label>
            <Input placeholder={text.placeholder} />
        </TextField>
    ));
}

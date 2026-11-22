import { PromptInput } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import * as React from 'react';
import { workerTitle } from './asks-preview.fixture.ts';

export function PreviewComposer({
    answerLabel,
    onReopen,
    onSend,
}: {
    answerLabel: null | string;
    onReopen: () => void;
    onSend: (text: string) => void;
}) {
    const [draft, setDraft] = React.useState('');
    const submit = () => {
        const text = draft.trim();
        if (!text) {
            return;
        }
        onSend(text);
        setDraft('');
    };

    return (
        <PromptInput
            layout="compact"
            onSubmit={submit}
            onValueChange={setDraft}
            value={draft}
            variant="primary"
        >
            <PromptInput.Shell>
                <PromptInput.Content>
                    <PromptInput.TextArea
                        aria-label={`Follow up with ${workerTitle}`}
                        placeholder="Follow up"
                    />
                </PromptInput.Content>
                <PromptInput.Toolbar>
                    <PromptInput.ToolbarStart>
                        {answerLabel ? (
                            <Button onPress={onReopen} size="sm" variant="secondary">
                                {answerLabel}
                            </Button>
                        ) : null}
                    </PromptInput.ToolbarStart>
                    <PromptInput.ToolbarEnd>
                        <PromptInput.Send aria-label="Send" isDisabled={draft.trim() === ''} />
                    </PromptInput.ToolbarEnd>
                </PromptInput.Toolbar>
            </PromptInput.Shell>
        </PromptInput>
    );
}

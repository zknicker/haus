import type { Worker } from '@haus/api';
import { PromptInput } from '@heroui-pro/react';
import { toast } from '@heroui/react';
import * as React from 'react';
import { useWorkerSendFollowUp, useWorkerStop } from '../../hooks/servers/use-worker.ts';
import { isWorkerStopping, isWorkerTurnLive } from './worker-card-model.ts';

export function WorkerFollowUpComposer({
    serverId,
    work,
}: {
    serverId: string;
    work: Pick<Worker, 'id' | 'status' | 'title' | 'turns'>;
}) {
    const [text, setText] = React.useState('');
    const nonce = React.useRef<null | string>(null);
    const send = useWorkerSendFollowUp();
    const stop = useWorkerStop();
    const live = isWorkerTurnLive(work);
    const canStop = live && !isWorkerStopping(work) && !stop.isPending;
    const draft = text.trim();

    const submit = () => {
        if (draft === '' || send.isPending) {
            return;
        }
        nonce.current ??= crypto.randomUUID();
        send.mutate(
            { nonce: nonce.current, serverId, text: draft, workerId: work.id },
            {
                onError: (error) =>
                    toast.danger('Could not send the follow-up', { description: error.message }),
                onSuccess: () => {
                    nonce.current = null;
                    setText('');
                },
            }
        );
    };

    const requestStop = () =>
        stop.mutate(
            { serverId, workerId: work.id },
            {
                onError: (error) =>
                    toast.danger('Could not stop this Worker', { description: error.message }),
            }
        );

    return (
        <PromptInput
            layout="compact"
            lockInputOnRun={false}
            onStop={requestStop}
            onSubmit={submit}
            onValueChange={setText}
            size="sm"
            status={composerStatus({ canStop, draft, sending: send.isPending })}
            value={text}
            variant="secondary"
        >
            <PromptInput.Shell>
                <PromptInput.Content>
                    <PromptInput.TextArea
                        aria-label={`Follow up with ${work.title}`}
                        placeholder={composerPlaceholder(work, live)}
                    />
                </PromptInput.Content>
                <PromptInput.Toolbar>
                    <PromptInput.ToolbarEnd>
                        <PromptInput.Send
                            aria-label={draft === '' && canStop ? 'Stop Worker' : 'Send follow-up'}
                            isDisabled={draft === '' && !canStop}
                        />
                    </PromptInput.ToolbarEnd>
                </PromptInput.Toolbar>
            </PromptInput.Shell>
        </PromptInput>
    );
}

function composerStatus(input: { canStop: boolean; draft: string; sending: boolean }) {
    if (input.sending) {
        return 'submitted';
    }
    return input.draft === '' && input.canStop ? 'streaming' : 'ready';
}

function composerPlaceholder(work: Pick<Worker, 'status'>, live: boolean) {
    if (live) {
        return 'Goes in when this turn ends';
    }
    return work.status === 'needs-you' ? 'Answer this Worker' : 'Follow up';
}

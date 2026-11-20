import type { Worker } from '@haus/api';
import { PromptInput } from '@heroui-pro/react';
import { toast } from '@heroui/react';
import * as React from 'react';
import { useWorkerSendFollowUp, useWorkerStop } from '../../hooks/servers/use-worker.ts';
import { isWorkerStopping, isWorkerTurnLive, liveWorkerTurns } from './worker-card-model.ts';
import { workerFollowUpControls } from './worker-follow-up-controls.ts';

export function WorkerFollowUpComposer({
    serverId,
    work,
}: {
    serverId: string;
    work: Pick<Worker, 'id' | 'status' | 'title' | 'turns'>;
}) {
    const [text, setText] = React.useState('');
    const [stopHeldFor, setStopHeldFor] = React.useState<null | string>(null);
    const [stopSentFor, setStopSentFor] = React.useState<null | string>(null);
    const nonce = React.useRef<null | string>(null);
    const latestText = React.useRef('');
    const send = useWorkerSendFollowUp();
    const stop = useWorkerStop();
    const live = isWorkerTurnLive(work);
    const liveTurnId = liveWorkerTurns(work).at(-1)?.turnId ?? null;
    const draft = text.trim();
    const controls = workerFollowUpControls({
        canStop:
            liveTurnId !== null &&
            !isWorkerStopping(work) &&
            !stop.isPending &&
            stopSentFor !== liveTurnId,
        draft,
        sending: send.isPending,
        stopHeld: liveTurnId !== null && stopHeldFor === liveTurnId,
    });

    const changeText = (value: string) => {
        nonce.current = null;
        latestText.current = value;
        setStopHeldFor(null);
        setText(value);
    };

    const submit = () => {
        if (draft === '' || send.isPending) {
            return;
        }
        const sent = text;
        nonce.current ??= crypto.randomUUID();
        send.mutate(
            { nonce: nonce.current, serverId, text: draft, workerId: work.id },
            {
                onError: (error) =>
                    toast.danger('Could not send the follow-up', { description: error.message }),
                onSuccess: () => {
                    nonce.current = null;
                    setStopHeldFor(liveTurnId);
                    if (latestText.current === sent) {
                        latestText.current = '';
                        setText('');
                    }
                },
            }
        );
    };

    const requestStop = () => {
        if (!controls.stops || liveTurnId === null) {
            return;
        }
        setStopSentFor(liveTurnId);
        stop.mutate(
            { serverId, workerId: work.id },
            {
                onError: (error) => {
                    setStopSentFor(null);
                    toast.danger('Could not stop this Worker', { description: error.message });
                },
            }
        );
    };

    return (
        <PromptInput
            lockInputOnRun={false}
            onStop={controls.stops ? requestStop : undefined}
            onSubmit={submit}
            onValueChange={changeText}
            status={controls.status}
            value={text}
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
                            aria-label={controls.label}
                            isDisabled={controls.sendDisabled}
                        />
                    </PromptInput.ToolbarEnd>
                </PromptInput.Toolbar>
            </PromptInput.Shell>
        </PromptInput>
    );
}

function composerPlaceholder(work: Pick<Worker, 'status'>, live: boolean) {
    if (live) {
        return 'Goes in when this turn ends';
    }
    return work.status === 'needs-you' ? 'Answer this Worker' : 'Follow up';
}

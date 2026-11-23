import { Button } from '@heroui/react';
import { ArrowLeft01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { questionTakeoverLabel } from './ask-copy.ts';
import { isAnswered, type QuestionAnswer, type QuestionRequest } from './ask-model.ts';
import { AskTakeoverFrame, StepDots, SubmitKbd } from './ask-takeover-frame.tsx';
import {
    type AskTakeoverAction,
    type AskTakeoverState,
    askTakeoverStart,
    askTakeoverView,
    stepAskTakeover,
} from './ask-takeover-state.ts';
import { QuestionStep } from './question-step.tsx';
import { QuestionSummary, type QuestionSummaryLook } from './question-summary.tsx';
import { useTakeoverKeys } from './use-takeover-keys.ts';

export function QuestionTakeover({
    look = 'plain',
    notice = null,
    onDismiss,
    onLater,
    onSend,
    request,
    sending = false,
}: {
    look?: QuestionSummaryLook;
    notice?: null | string;
    onDismiss: () => void;
    onLater: () => void;
    onSend: (answers: readonly QuestionAnswer[]) => void;
    request: QuestionRequest;
    sending?: boolean;
}) {
    const [state, setState] = React.useState<AskTakeoverState>(() => askTakeoverStart(request));
    const view = askTakeoverView(state);
    const { step } = state;
    const run = (action: AskTakeoverAction) => {
        const result = stepAskTakeover(state, action);
        setState(result.state);
        if (result.submit && !sending) {
            onSend(result.state.answers);
        }
    };

    useTakeoverKeys({
        onDigit: (index) => run({ index, kind: 'key' }),
        onSubmit: () => run({ kind: 'send' }),
    });

    return (
        <AskTakeoverFrame
            end={
                view.sends ? (
                    <Button
                        isDisabled={!view.canSend}
                        isPending={sending}
                        onPress={() => run({ kind: 'send' })}
                        size="sm"
                        variant="primary"
                    >
                        {view.total === 1 ? 'Send answer' : 'Send answers'}
                        <SubmitKbd />
                    </Button>
                ) : (
                    <Button onPress={() => run({ kind: 'next' })} size="sm" variant="ghost">
                        Next
                    </Button>
                )
            }
            label={questionTakeoverLabel(step, view.total)}
            notice={notice}
            start={
                <>
                    {step > 0 ? (
                        <Button onPress={() => run({ kind: 'back' })} size="sm" variant="ghost">
                            <Icon icon={ArrowLeft01Icon} size={14} />
                            Back
                        </Button>
                    ) : null}
                    <Button onPress={onLater} size="sm" variant="outline">
                        Later
                    </Button>
                    <Button onPress={onDismiss} size="sm" variant="ghost">
                        Dismiss
                    </Button>
                </>
            }
            trailing={
                <StepDots
                    current={step}
                    steps={state.questions.map((_, index) => ({
                        done: isAnswered(state.answers[index]),
                        key: String(index),
                    }))}
                />
            }
        >
            {view.question && view.answer ? (
                <QuestionStep
                    answer={view.answer}
                    key={step}
                    onEnter={() => run({ kind: 'enter' })}
                    onPick={(labels) => run({ kind: 'pick', labels })}
                    onText={(text) => run({ kind: 'type', text })}
                    question={view.question}
                />
            ) : (
                <QuestionSummary
                    answers={state.answers}
                    look={look}
                    onEdit={(index) => run({ kind: 'edit', step: index })}
                    questions={state.questions}
                />
            )}
        </AskTakeoverFrame>
    );
}

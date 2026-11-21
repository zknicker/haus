import { Button } from '@heroui/react';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { questionTakeoverLabel } from './ask-copy.ts';
import {
    emptyAnswers,
    isAnswered,
    type QuestionAnswer,
    type QuestionRequest,
} from './ask-model.ts';
import { AskTakeoverFrame, StepDots, SubmitKbd } from './ask-takeover-frame.tsx';
import { QuestionStep, toggleOption } from './question-step.tsx';
import { QuestionSummary, type QuestionSummaryLook } from './question-summary.tsx';
import { useTakeoverKeys } from './use-takeover-keys.ts';

export function QuestionTakeover({
    look,
    onDismiss,
    onLater,
    onSend,
    request,
}: {
    look: QuestionSummaryLook;
    onDismiss: () => void;
    onLater: () => void;
    onSend: (answers: readonly QuestionAnswer[]) => void;
    request: QuestionRequest;
}) {
    const total = request.questions.length;
    const [step, setStep] = React.useState(0);
    const [answers, setAnswers] = React.useState(() => emptyAnswers(request));
    const reviewing = total > 1 && step === total;
    const question = request.questions[step];
    const current = answers[step];
    const canSend = answers.every(isAnswered);

    const advance = (next: readonly QuestionAnswer[]) => {
        if (total === 1) {
            onSend(next);
            return;
        }
        setStep(step + 1);
    };
    const update = (patch: Partial<QuestionAnswer>) => {
        const next = answers.map((answer, index) =>
            index === step ? { ...answer, ...patch } : answer
        );
        setAnswers(next);
        return next;
    };
    const pick = (labels: string[]) => {
        const next = update({ labels });
        if (question && !question.multiSelect && labels.length > 0) {
            advance(next);
        }
    };
    const send = () => {
        if (canSend && (total === 1 || reviewing)) {
            onSend(answers);
        }
    };

    useTakeoverKeys({
        onDigit: (index) => {
            const labels =
                reviewing || !(question && current) ? null : toggleOption(question, current, index);
            if (labels) {
                pick(labels);
            }
        },
        onSubmit: send,
    });

    return (
        <AskTakeoverFrame
            end={
                total === 1 || reviewing ? (
                    <Button isDisabled={!canSend} onPress={send} size="sm" variant="primary">
                        {total === 1 ? 'Send answer' : 'Send answers'}
                        <SubmitKbd />
                    </Button>
                ) : (
                    <Button
                        isDisabled={!isAnswered(current)}
                        onPress={() => setStep(step + 1)}
                        size="sm"
                        variant="ghost"
                    >
                        Next
                    </Button>
                )
            }
            label={questionTakeoverLabel(step, total)}
            start={
                <>
                    {step > 0 ? (
                        <Button onPress={() => setStep(step - 1)} size="sm" variant="ghost">
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
                    steps={request.questions.map((item, index) => ({
                        done: isAnswered(answers[index]),
                        key: item.header,
                    }))}
                />
            }
        >
            {reviewing || !(question && current) ? (
                <QuestionSummary
                    answers={answers}
                    look={look}
                    onEdit={setStep}
                    questions={request.questions}
                />
            ) : (
                <QuestionStep
                    answer={current}
                    key={question.header}
                    onEnter={() => {
                        if (isAnswered(current)) {
                            advance(answers);
                        }
                    }}
                    onPick={pick}
                    onText={(text) => update({ text })}
                    question={question}
                />
            )}
        </AskTakeoverFrame>
    );
}

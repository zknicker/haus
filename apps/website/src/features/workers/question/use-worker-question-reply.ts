import { type WorkerQuestions, workerAnswersText } from '@haus/api';
import { toast } from '@heroui/react';
import * as React from 'react';
import {
    useWorkerDismissQuestion,
    useWorkerSendFollowUp,
} from '../../../hooks/servers/use-worker.ts';
import { isAnswered, type QuestionAnswer } from '../../asks/ask-model.ts';

export interface WorkerQuestionRefusal {
    message: string;
    text: string;
    turnId: string;
}

export function useWorkerQuestionReply({
    serverId,
    workerId,
}: {
    serverId: string;
    workerId: string;
}) {
    const send = useWorkerSendFollowUp();
    const dismiss = useWorkerDismissQuestion();
    const [refusal, setRefusal] = React.useState<null | WorkerQuestionRefusal>(null);
    const [answeredTurnId, setAnsweredTurnId] = React.useState<null | string>(null);
    const nonce = React.useRef<null | { text: string; value: string }>(null);

    const sendAnswers = (
        question: { questions: WorkerQuestions; turnId: string },
        answers: readonly QuestionAnswer[]
    ) => {
        if (send.isPending) {
            return;
        }
        const text = workerAnswersText(question.questions, workerQuestionAnswers(answers));
        if (nonce.current?.text !== text) {
            nonce.current = { text, value: crypto.randomUUID() };
        }
        send.mutate(
            {
                answersTurnId: question.turnId,
                nonce: nonce.current.value,
                serverId,
                text,
                workerId,
            },
            {
                onError: (error) => {
                    if (isRefusal(error)) {
                        nonce.current = null;
                        setRefusal({ message: error.message, text, turnId: question.turnId });
                        return;
                    }
                    toast.danger('Could not send the answers', { description: error.message });
                },
                onSuccess: () => {
                    nonce.current = null;
                    setRefusal(null);
                    setAnsweredTurnId(question.turnId);
                },
            }
        );
    };

    const dismissQuestions = (turnId: string) => {
        if (dismiss.isPending) {
            return;
        }
        dismiss.mutate(
            { serverId, turnId, workerId },
            {
                onError: (error) => {
                    if (isRefusal(error)) {
                        setRefusal({ message: error.message, text: '', turnId });
                        return;
                    }
                    toast.danger('Could not dismiss the questions', {
                        description: error.message,
                    });
                },
            }
        );
    };

    return {
        answeredTurnId,
        clearRefusal: () => setRefusal(null),
        dismissQuestions,
        refusal,
        sendAnswers,
        sending: send.isPending,
    };
}

export function workerQuestionAnswers(answers: readonly QuestionAnswer[]) {
    return answers.map((answer) =>
        isAnswered(answer) ? { labels: [...answer.labels], text: answer.text.trim() || null } : null
    );
}

function isRefusal(error: { data?: { code?: string } | null }) {
    return error.data?.code === 'CONFLICT';
}

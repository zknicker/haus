import { type Worker, type WorkerQuestionsClosed, workerQuestionOf } from '@haus/api';
import { Button } from '@heroui/react';
import {
    setQuestionsLater,
    useQuestionsLater,
} from '../../../hooks/workers/use-questions-later.ts';
import { answerQuestionsLabel } from '../../asks/ask-copy.ts';
import { QuestionTakeover } from '../../asks/question-takeover.tsx';
import { useWorkerAuthorName } from '../log/use-worker-author-name.ts';
import { canFollowUpWorker } from '../worker-card-model.ts';
import { WorkerFollowUpComposer } from '../worker-follow-up-composer.tsx';
import { useWorkerQuestionReply } from './use-worker-question-reply.ts';

export function WorkerComposerDock({ serverId, work }: { serverId: string; work: Worker }) {
    const question = workerQuestionOf(work);
    const later = useQuestionsLater(question?.turnId ?? null);
    const reply = useWorkerQuestionReply({ serverId, workerId: work.id });
    const name = useWorkerAuthorName(serverId);
    const canFollowUp = canFollowUpWorker(work);
    const asking =
        question?.open && canFollowUp && reply.answeredTurnId !== question.turnId ? question : null;

    if (asking && !later) {
        return (
            <div className="shrink-0 px-5 pb-4">
                <QuestionTakeover
                    key={asking.turnId}
                    notice={reply.refusal?.turnId === asking.turnId ? reply.refusal.message : null}
                    onDismiss={() => reply.dismissQuestions(asking.turnId)}
                    onLater={() => setQuestionsLater(asking.turnId, true)}
                    onSend={(answers) => reply.sendAnswers(asking, answers)}
                    request={asking}
                    sending={reply.sending}
                />
            </div>
        );
    }
    const line = reply.refusal?.message ?? closedLine(question?.closed ?? null, name);
    return (
        <>
            {line ? (
                <p className="text-muted px-5 pb-2 text-sm" data-testid="worker-question-line">
                    {line}
                </p>
            ) : null}
            {canFollowUp ? (
                <WorkerFollowUpComposer
                    initialText={reply.refusal?.text}
                    onSent={reply.clearRefusal}
                    serverId={serverId}
                    work={work}
                >
                    {asking ? (
                        <Button
                            onPress={() => setQuestionsLater(asking.turnId, false)}
                            size="sm"
                            variant="secondary"
                        >
                            {answerQuestionsLabel(asking)}
                        </Button>
                    ) : null}
                </WorkerFollowUpComposer>
            ) : null}
        </>
    );
}

function closedLine(
    closed: null | WorkerQuestionsClosed,
    name: (author: WorkerQuestionsClosed['by']) => string
) {
    if (!closed) {
        return null;
    }
    return closed.reason === 'dismissed'
        ? `Dismissed by ${name(closed.by)}`
        : `Stopped by ${name(closed.by)}`;
}

import { Segment } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import * as React from 'react';
import { answerQuestionsLabel } from '../asks/ask-copy.ts';
import type { QuestionSummaryLook } from '../asks/question-summary.tsx';
import { QuestionTakeover } from '../asks/question-takeover.tsx';
import { PreviewComposer } from './asks-preview-composer.tsx';
import { findReviewLook, reviewLooks } from './asks-preview-looks.ts';
import { PreviewTranscript } from './asks-preview-message.tsx';
import { workerPreviewReducer } from './asks-preview-state.ts';
import {
    migrationQuestions,
    workerName,
    workerOpening,
    workerTitle,
} from './asks-preview.fixture.ts';

export function WorkerQuestionScene() {
    const [run, setRun] = React.useState(0);
    const [look, setLook] = React.useState<QuestionSummaryLook>('plain');
    return (
        <div className="flex h-svh min-w-0 flex-col">
            <div className="flex h-14 shrink-0 items-center gap-3 px-5">
                <Segment
                    aria-label="Review look"
                    onSelectionChange={(key) => {
                        const entry = findReviewLook(String(key));
                        if (entry) {
                            setLook(entry.look);
                        }
                    }}
                    selectedKey={look}
                    size="sm"
                >
                    {reviewLooks.map((entry) => (
                        <Segment.Item id={entry.look} key={entry.look}>
                            {entry.short}
                        </Segment.Item>
                    ))}
                </Segment>
                <Button onPress={() => setRun(run + 1)} size="sm" variant="ghost">
                    Restart
                </Button>
            </div>
            <WorkerPage key={run} look={look} />
        </div>
    );
}

function WorkerPage({ look }: { look: QuestionSummaryLook }) {
    const [state, dispatch] = React.useReducer(workerPreviewReducer, {
        items: workerOpening,
        phase: 'open',
        request: migrationQuestions,
    });
    return (
        <section aria-label={workerTitle} className="flex min-h-0 flex-1 flex-col">
            <header className="mx-auto flex w-full max-w-3xl items-baseline gap-2 px-5">
                <h1 className="text-foreground text-sm font-semibold">{workerTitle}</h1>
                <span className="text-muted text-xs">{workerName}</span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
                <PreviewTranscript items={state.items} />
            </div>
            <div className="mx-auto w-full max-w-3xl shrink-0 px-5 pb-4">
                {state.phase === 'open' ? (
                    <QuestionTakeover
                        look={look}
                        onDismiss={() => dispatch({ kind: 'dismiss' })}
                        onLater={() => dispatch({ kind: 'later' })}
                        onSend={(answers) => dispatch({ answers, kind: 'answer' })}
                        request={state.request}
                    />
                ) : (
                    <PreviewComposer
                        answerLabel={
                            state.phase === 'later' ? answerQuestionsLabel(state.request) : null
                        }
                        onReopen={() => dispatch({ kind: 'reopen' })}
                        onSend={(text) => dispatch({ kind: 'send', text })}
                    />
                )}
            </div>
        </section>
    );
}

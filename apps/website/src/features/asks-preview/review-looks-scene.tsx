import { Button } from '@heroui/react';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { Icon } from '../../components/ui/icon.tsx';
import { isAnswered } from '../asks/ask-model.ts';
import { AskTakeoverFrame, StepDots, SubmitKbd } from '../asks/ask-takeover-frame.tsx';
import { QuestionSummary, type QuestionSummaryLook } from '../asks/question-summary.tsx';
import { reviewLooks } from './asks-preview-looks.ts';
import { migrationQuestions, reviewAnswers } from './asks-preview.fixture.ts';

const { questions } = migrationQuestions;
const ignoreEdit = () => undefined;

export function ReviewLooksScene() {
    return (
        <main className="grid min-w-0 grid-cols-1 items-start gap-5 px-5 pt-16 pb-6 md:grid-cols-2 xl:grid-cols-4">
            {reviewLooks.map(({ look, title }) => (
                <section className="flex min-w-0 flex-col gap-2" key={look}>
                    <h2 className="text-muted text-xs">{title}</h2>
                    <ReviewFrame look={look} />
                </section>
            ))}
        </main>
    );
}

function ReviewFrame({ look }: { look: QuestionSummaryLook }) {
    return (
        <AskTakeoverFrame
            end={
                <Button isDisabled={!reviewAnswers.every(isAnswered)} size="sm" variant="primary">
                    Send answers
                    <SubmitKbd />
                </Button>
            }
            label="Review"
            start={
                <>
                    <Button size="sm" variant="ghost">
                        <Icon icon={ArrowLeft01Icon} size={14} />
                        Back
                    </Button>
                    <Button size="sm" variant="outline">
                        Later
                    </Button>
                    <Button size="sm" variant="ghost">
                        Dismiss
                    </Button>
                </>
            }
            trailing={
                <StepDots
                    current={questions.length}
                    steps={questions.map((question, index) => ({
                        done: isAnswered(reviewAnswers[index]),
                        key: question.header,
                    }))}
                />
            }
        >
            <QuestionSummary
                answers={reviewAnswers}
                look={look}
                onEdit={ignoreEdit}
                questions={questions}
            />
        </AskTakeoverFrame>
    );
}

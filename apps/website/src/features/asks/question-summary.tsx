import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Chip, Separator } from '@heroui/react';
import {
    CheckmarkCircle02Icon,
    CircleIcon,
    PencilEdit02Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { optionDisplayLabel } from './ask-copy.ts';
import { type AskQuestion, isAnswered, type QuestionAnswer } from './ask-model.ts';

export type QuestionSummaryLook = 'compact' | 'grid' | 'list' | 'plain';

export function QuestionSummary({
    answers,
    look,
    onEdit,
    questions,
}: {
    answers: readonly QuestionAnswer[];
    look: QuestionSummaryLook;
    onEdit?: (step: number) => void;
    questions: readonly AskQuestion[];
}) {
    const rows = questions.map((question, index) => ({
        answer: answers[index],
        index,
        question,
    }));
    if (look === 'plain') {
        return (
            <dl className="flex flex-col gap-2">
                {rows.map((row) => (
                    <div className="flex items-start justify-between gap-2" key={row.index}>
                        <div className="min-w-0">
                            <dt className="text-muted text-xs">{row.question.question}</dt>
                            <dd className="text-foreground text-sm">
                                <SummaryValue answer={row.answer} question={row.question} />
                            </dd>
                        </div>
                        {onEdit ? (
                            <EditButton index={row.index} onEdit={onEdit} question={row.question} />
                        ) : null}
                    </div>
                ))}
            </dl>
        );
    }
    if (look === 'grid') {
        return (
            <ItemCardGroup columns={2} layout="grid" variant="tertiary">
                {rows.map((row) => (
                    <SummaryRow key={row.index} label="header" onEdit={onEdit} {...row} />
                ))}
            </ItemCardGroup>
        );
    }
    return (
        <ItemCardGroup variant={look === 'list' ? 'secondary' : 'transparent'}>
            {rows.map((row, position) => (
                <React.Fragment key={row.index}>
                    {position > 0 ? <Separator /> : null}
                    <SummaryRow
                        label={look === 'list' ? 'question' : 'header'}
                        mark={look === 'list'}
                        onEdit={onEdit}
                        {...row}
                    />
                </React.Fragment>
            ))}
        </ItemCardGroup>
    );
}

function SummaryRow({
    answer,
    index,
    label,
    mark = false,
    onEdit,
    question,
}: {
    answer: QuestionAnswer | undefined;
    index: number;
    label: 'header' | 'question';
    mark?: boolean;
    onEdit?: (step: number) => void;
    question: AskQuestion;
}) {
    const answered = isAnswered(answer);
    return (
        <ItemCard>
            {mark ? (
                <ItemCard.Icon>
                    <Icon
                        className={answered ? 'text-success' : 'text-muted'}
                        icon={answered ? CheckmarkCircle02Icon : CircleIcon}
                        size={16}
                    />
                </ItemCard.Icon>
            ) : null}
            <ItemCard.Content>
                <ItemCard.Description>
                    {label === 'header'
                        ? (question.header ?? question.question)
                        : question.question}
                </ItemCard.Description>
                <ItemCard.Title>
                    <SummaryValue answer={answer} question={question} />
                </ItemCard.Title>
            </ItemCard.Content>
            {onEdit ? (
                <ItemCard.Action>
                    <EditButton index={index} onEdit={onEdit} question={question} />
                </ItemCard.Action>
            ) : null}
        </ItemCard>
    );
}

function EditButton({
    index,
    onEdit,
    question,
}: {
    index: number;
    onEdit: (step: number) => void;
    question: AskQuestion;
}) {
    return (
        <Button
            aria-label={`Change the answer to ${question.header ?? question.question}`}
            isIconOnly
            onPress={() => onEdit(index)}
            size="sm"
            variant="ghost"
        >
            <Icon icon={PencilEdit02Icon} size={14} />
        </Button>
    );
}

function SummaryValue({
    answer,
    question,
}: {
    answer: QuestionAnswer | undefined;
    question: AskQuestion;
}) {
    if (!(answer && isAnswered(answer))) {
        return (
            <Chip color="warning" size="sm" variant="soft">
                <Chip.Label>No answer yet</Chip.Label>
            </Chip>
        );
    }
    const typed = answer.text.trim();
    if (question.multiSelect && answer.labels.length > 0) {
        return (
            <span className="flex flex-wrap gap-1">
                {[...answer.labels.map(optionDisplayLabel), ...(typed ? [typed] : [])].map(
                    (value) => (
                        <Chip key={value} size="sm" variant="secondary">
                            <Chip.Label>{value}</Chip.Label>
                        </Chip>
                    )
                )}
            </span>
        );
    }
    return (
        <span>
            {[...answer.labels.map(optionDisplayLabel), ...(typed ? [typed] : [])].join(' · ')}
        </span>
    );
}

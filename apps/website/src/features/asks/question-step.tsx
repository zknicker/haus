import { Description, Input, Kbd, Label, ListBox, type Selection, TextField } from '@heroui/react';
import type { AskQuestion, QuestionAnswer } from './ask-model.ts';

const keyedOptionLimit = 9;

export function QuestionStep({
    answer,
    onEnter,
    onPick,
    onText,
    question,
}: {
    answer: QuestionAnswer;
    onEnter: () => void;
    onPick: (labels: string[]) => void;
    onText: (text: string) => void;
    question: AskQuestion;
}) {
    return (
        <div className="flex flex-col gap-3">
            <p className="text-foreground text-sm font-medium text-balance">{question.question}</p>
            <ListBox
                aria-label={question.question}
                onSelectionChange={(keys) => onPick(selectedLabels(keys, question))}
                selectedKeys={new Set(answer.labels)}
                selectionMode={question.multiSelect ? 'multiple' : 'single'}
            >
                {question.options.map((option, index) => (
                    <ListBox.Item id={option.label} key={option.label} textValue={option.label}>
                        {index < keyedOptionLimit ? (
                            <Kbd aria-hidden="true">
                                <Kbd.Content>{index + 1}</Kbd.Content>
                            </Kbd>
                        ) : null}
                        <div className="flex min-w-0 flex-col">
                            <Label>{option.label}</Label>
                            {option.description ? (
                                <Description>{option.description}</Description>
                            ) : null}
                        </div>
                        <ListBox.ItemIndicator />
                    </ListBox.Item>
                ))}
            </ListBox>
            <TextField
                aria-label="Or type an answer"
                fullWidth
                onChange={onText}
                value={answer.text}
                variant="secondary"
            >
                <Input
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !(event.metaKey || event.ctrlKey)) {
                            event.preventDefault();
                            onEnter();
                        }
                    }}
                    placeholder="Or type an answer"
                />
            </TextField>
        </div>
    );
}

export function toggleOption(question: AskQuestion, answer: QuestionAnswer, index: number) {
    const option = question.options[index];
    if (!option) {
        return null;
    }
    if (!question.multiSelect) {
        return [option.label];
    }
    return answer.labels.includes(option.label)
        ? answer.labels.filter((label) => label !== option.label)
        : [...answer.labels, option.label];
}

function selectedLabels(keys: Selection, question: AskQuestion) {
    if (keys === 'all') {
        return question.options.map((option) => option.label);
    }
    return question.options.map((option) => option.label).filter((label) => keys.has(label));
}

import { Description, Input, Kbd, Label, ListBox, type Selection, TextField } from '@heroui/react';
import { optionDisplayLabel, typedAnswerLabel } from './ask-copy.ts';
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
    const typedLabel = typedAnswerLabel(question);
    return (
        <div className="flex flex-col gap-3">
            <p className="text-foreground text-sm font-medium text-balance">{question.question}</p>
            {question.options.length > 0 ? (
                <ListBox
                    aria-label={question.question}
                    onSelectionChange={(keys) => onPick(selectedLabels(keys, question))}
                    selectedKeys={new Set(answer.labels)}
                    selectionMode={question.multiSelect ? 'multiple' : 'single'}
                >
                    {question.options.map((option, index) => (
                        <ListBox.Item
                            id={option.label}
                            key={option.label}
                            textValue={optionDisplayLabel(option.label)}
                        >
                            {index < keyedOptionLimit ? (
                                <Kbd aria-hidden="true">
                                    <Kbd.Content>{index + 1}</Kbd.Content>
                                </Kbd>
                            ) : null}
                            <div className="flex min-w-0 flex-col">
                                <Label>{optionDisplayLabel(option.label)}</Label>
                                {option.description ? (
                                    <Description>{option.description}</Description>
                                ) : null}
                            </div>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            ) : null}
            <TextField
                aria-label={typedLabel}
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
                    placeholder={typedLabel}
                />
            </TextField>
        </div>
    );
}

function selectedLabels(keys: Selection, question: AskQuestion) {
    if (keys === 'all') {
        return question.options.map((option) => option.label);
    }
    return question.options.map((option) => option.label).filter((label) => keys.has(label));
}

import { TASK_KEY_PREFIX_PATTERN } from '@haus/api';
import {
    Button,
    FieldError,
    Input,
    Label,
    ListBox,
    Select,
    Separator,
    TextField,
} from '@heroui/react';
import * as React from 'react';
import { useCreateTaskKey, useTaskKeys } from '../../hooks/tasks/use-task-keys.ts';

const newKeyOption = 'new-key';

/**
 * The key a Channel's Tasks take (ADR 0052 decision 11): one entry of the
 * Server's ledger, shared with any other Channel that picks it, or a new one
 * added here. A key is never renamed or reused, so a new one is final.
 */
export function ChannelTaskKeyField({
    isDisabled,
    onChange,
    serverId,
    value,
}: {
    isDisabled: boolean;
    onChange: (taskKeyId: string) => void;
    serverId: string;
    value: null | string;
}) {
    const keys = useTaskKeys(serverId).data ?? [];
    const [adding, setAdding] = React.useState(false);

    return (
        <div className="flex flex-col gap-2">
            <Select
                fullWidth
                isDisabled={isDisabled}
                onChange={(next) => {
                    if (next === newKeyOption) {
                        setAdding(true);
                    } else if (typeof next === 'string') {
                        setAdding(false);
                        onChange(next);
                    }
                }}
                placeholder="No key"
                value={adding ? newKeyOption : value}
                variant="secondary"
            >
                <Label>Task key</Label>
                <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                    <ListBox>
                        {keys.map((entry) => (
                            <ListBox.Item id={entry.id} key={entry.id} textValue={entry.key}>
                                <Label>{entry.key}</Label>
                                <ListBox.ItemIndicator />
                            </ListBox.Item>
                        ))}
                        {keys.length > 0 ? <Separator /> : null}
                        <ListBox.Item id={newKeyOption} textValue="New key">
                            <Label>New key…</Label>
                        </ListBox.Item>
                    </ListBox>
                </Select.Popover>
            </Select>
            {adding ? (
                <NewTaskKey
                    onCreated={(taskKeyId) => {
                        setAdding(false);
                        onChange(taskKeyId);
                    }}
                    serverId={serverId}
                />
            ) : null}
        </div>
    );
}

function NewTaskKey({
    onCreated,
    serverId,
}: {
    onCreated: (taskKeyId: string) => void;
    serverId: string;
}) {
    const create = useCreateTaskKey();
    const [key, setKey] = React.useState('');
    const normalized = key.trim().toUpperCase();
    const valid = TASK_KEY_PREFIX_PATTERN.test(normalized);
    const add = () => {
        if (valid && !create.isPending) {
            create.mutate(
                { key: normalized, serverId },
                { onSuccess: ({ taskKey }) => onCreated(taskKey.id) }
            );
        }
    };

    return (
        <div className="flex items-start gap-2">
            <TextField
                className="flex-1"
                isDisabled={create.isPending}
                isInvalid={Boolean(create.error) || (key.length > 0 && !valid)}
                onChange={setKey}
                value={key}
                variant="secondary"
            >
                <Label className="sr-only">New key</Label>
                <Input
                    autoFocus
                    onKeyDown={(event) => {
                        // Enter adds the key rather than submitting the channel form.
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            add();
                        }
                    }}
                    placeholder="SEC"
                />
                <FieldError>
                    {create.error?.message ??
                        'A key is 2 to 5 capital letters or digits, starting with a letter.'}
                </FieldError>
            </TextField>
            <Button
                isDisabled={!valid}
                isPending={create.isPending}
                onPress={add}
                size="md"
                variant="secondary"
            >
                Add key
            </Button>
        </div>
    );
}

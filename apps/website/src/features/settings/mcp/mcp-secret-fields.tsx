import { Button, Description, Fieldset, Input, TextField, Tooltip } from '@heroui/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { Icon } from '../../../components/ui/icon.tsx';
import { createSecretDraftEntry, type SecretDraftEntry } from './mcp-server-shared.ts';

/**
 * Name/value secret pairs as one labeled set. `Fieldset` is what says "these
 * controls belong together": it owns the legend, the guidance under it, and the
 * add action, so none of them are hand-drawn text next to the rows.
 */
export function SecretFieldsEditor({
    addLabel,
    description,
    entries,
    onChange,
    title,
}: {
    addLabel: string;
    description?: string;
    entries: SecretDraftEntry[];
    onChange: (next: SecretDraftEntry[]) => void;
    title: string;
}) {
    return (
        <Fieldset className="min-w-0">
            <Fieldset.Legend>{title}</Fieldset.Legend>
            {description ? <Description>{description}</Description> : null}
            <Fieldset.Group>
                {entries.map((entry, index) => (
                    <div
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2"
                        key={entry.key}
                    >
                        {/* Name, value, and remove share one row that splits
                            whatever the host gives it. Sized off the fields'
                            own widths the row runs past a narrow host — the
                            Add MCP drawer is 315px. */}
                        <TextField
                            aria-label={`${title} name`}
                            className="min-w-0"
                            onChange={(value) =>
                                onChange(
                                    replaceEntryAt(entries, index, {
                                        ...entry,
                                        name: value,
                                    })
                                )
                            }
                            value={entry.name}
                            variant="secondary"
                        >
                            <Input placeholder="Name" />
                        </TextField>
                        <TextField
                            aria-label={`${title} value`}
                            className="min-w-0"
                            onChange={(value) =>
                                onChange(
                                    replaceEntryAt(entries, index, {
                                        ...entry,
                                        value,
                                    })
                                )
                            }
                            type="password"
                            value={entry.value}
                            variant="secondary"
                        >
                            <Input placeholder="Value" />
                        </TextField>
                        <Tooltip delay={0}>
                            <Button
                                aria-label={`Remove ${title.toLowerCase()} entry`}
                                isIconOnly
                                onPress={() => onChange(entries.filter((_, at) => at !== index))}
                                size="sm"
                                type="button"
                                variant="ghost"
                            >
                                <Icon icon={Cancel01Icon} />
                            </Button>
                            <Tooltip.Content placement="top">Remove Entry</Tooltip.Content>
                        </Tooltip>
                    </div>
                ))}
            </Fieldset.Group>
            <Fieldset.Actions>
                <Button
                    onPress={() => onChange([...entries, createSecretDraftEntry()])}
                    size="sm"
                    type="button"
                    variant="secondary"
                >
                    {addLabel}
                </Button>
            </Fieldset.Actions>
        </Fieldset>
    );
}

function replaceEntryAt(
    entries: SecretDraftEntry[],
    index: number,
    next: SecretDraftEntry
): SecretDraftEntry[] {
    return entries.map((entry, at) => (at === index ? next : entry));
}

import { Button, Tooltip } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { CodeBlock } from '@heroui-pro/react/code-block';
import { InformationCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { SettingsFact } from '../../settings/layout/settings-text.tsx';
import type { TriggerKindOption } from './agent-trigger-model.ts';

/**
 * Where an existing Trigger is reached. The URL is a durable fact, so it reads
 * as one — a row with its value and the stock copy control — rather than as a
 * code block competing with the shown-once values above it. What a caller has
 * to do with the URL is three sentences read once, so it sits behind the info
 * affordance instead of on the row.
 */
export function TriggerWhenToRun({ kind, url }: { kind: TriggerKindOption; url: string }) {
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>When to run</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <ItemCard>
                    {/* Content stacks its children in a column, so the title
                        and its affordance share one row of their own. It also
                        holds its width: the value beside it is the part that
                        truncates, not the label naming it. */}
                    <ItemCard.Content className="shrink-0 basis-auto">
                        <div className="flex items-center gap-0.5">
                            <ItemCard.Title>URL</ItemCard.Title>
                            <Tooltip delay={0}>
                                <Button
                                    aria-label="About this trigger's URL"
                                    isIconOnly
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                >
                                    <Icon icon={InformationCircleIcon} size={14} />
                                </Button>
                                <Tooltip.Content placement="top">
                                    {`${kind.label}: ${kind.description}.`} Send the Trigger’s
                                    secret as a bearer token; the request body arrives as the fire’s
                                    payload.
                                </Tooltip.Content>
                            </Tooltip>
                        </div>
                    </ItemCard.Content>
                    {/* A URL is one unbroken token: without a shrinkable
                        flex item it sets the row's minimum width, and every
                        sibling group in the body stretches to match it. */}
                    <ItemCard.Action className="flex min-w-0 shrink items-center gap-1">
                        <SettingsFact className="min-w-0 truncate font-mono" title={url}>
                            {url}
                        </SettingsFact>
                        <CodeBlock.CopyButton aria-label="Copy trigger URL" code={url} />
                    </ItemCard.Action>
                </ItemCard>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

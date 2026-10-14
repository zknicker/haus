import type { ImageGeneration } from '@haus/api';
import { Button } from '@heroui/react';
import * as React from 'react';
import { formatElapsed, formatImageGenerationCost } from './image-generation-presentation.ts';

type Fact = [label: string, value: string];

export type ReadyImageGeneration = ImageGeneration & { result: { state: 'ready' } };

export function isReadyImageGeneration(
    generation: ImageGeneration
): generation is ReadyImageGeneration {
    return generation.result.state === 'ready';
}

/** The viewer's side panel: the prompt behind the image, then its model, size, cost, and time. */
export function ImageGenerationDetails({ generation }: { generation: ReadyImageGeneration }) {
    const { request, result } = generation;
    const facts: Fact[] = [
        ['Model', generation.modelDisplayName],
        ['Size', `${result.width}×${result.height} · ${result.resolution}`],
    ];
    if (request.quality) {
        facts.push(['Quality', request.quality]);
    }
    if (request.background === 'transparent') {
        facts.push(['Background', 'Transparent']);
    }
    facts.push(['Cost', formatImageGenerationCost(result.cost)]);
    facts.push(['Time', formatElapsed(result.durationMs)]);

    return (
        <div className="flex min-w-0 flex-col gap-4" data-slot="image-generation-details">
            <ExpandablePrompt key={generation.id} prompt={generation.prompt} />
            <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                {facts.map(([label, value]) => (
                    <React.Fragment key={label}>
                        <dt className="text-muted">{label}</dt>
                        <dd className="m-0 break-words tabular-nums">{value}</dd>
                    </React.Fragment>
                ))}
            </dl>
        </div>
    );
}

const promptClampChars = 220;

/** Three lines of the prompt; the rest sits behind a quiet toggle. */
function ExpandablePrompt({ prompt }: { prompt: string }) {
    const [expanded, setExpanded] = React.useState(false);
    const long = prompt.length > promptClampChars;
    return (
        <div className="flex min-w-0 flex-col items-start gap-1">
            <p className="font-medium text-muted text-xs uppercase tracking-wide">Prompt</p>
            <p
                className={
                    expanded || !long
                        ? 'whitespace-pre-wrap break-words text-sm'
                        : 'line-clamp-3 whitespace-pre-wrap break-words text-sm'
                }
            >
                {prompt}
            </p>
            {long ? (
                <Button
                    aria-expanded={expanded}
                    onPress={() => setExpanded((value) => !value)}
                    size="sm"
                    variant="ghost"
                >
                    {expanded ? 'Show less' : 'Show more'}
                </Button>
            ) : null}
        </div>
    );
}

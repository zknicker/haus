import { Chip, Tooltip } from '@heroui/react';
import type * as React from 'react';
import { Button } from 'react-aria-components';
import type { ReactionSticker } from './reaction-pile-model.ts';
import { ReactorFace, useReactors } from './reactor-identity.tsx';

/** The "+N" chip for reactions past the pile's first stickers, listing each one. */
export function ReactionOverflowChip({
    entries,
    index,
}: {
    entries: readonly ReactionSticker[];
    index: number;
}) {
    const toReactor = useReactors();
    const lines = entries.map((entry) => ({
        emoji: entry.emoji,
        key: entry.key,
        reactor: toReactor(entry.actor),
    }));
    const label = lines.map((line) => `${line.emoji} from ${line.reactor.name}`).join(', ');

    return (
        <Tooltip closeDelay={0} delay={0}>
            <Button
                aria-label={`${entries.length} more: ${label}`}
                className="reaction-overflow"
                style={{ '--i': index } as React.CSSProperties}
            >
                <Chip size="sm">+{entries.length}</Chip>
            </Button>
            <Tooltip.Content showArrow>
                <Tooltip.Arrow />
                <span className="flex flex-col gap-1">
                    {lines.map((line) => (
                        <span className="flex items-center gap-1.5" key={line.key}>
                            <ReactorFace reactor={line.reactor} />
                            <span className="font-medium">{line.reactor.name}</span>
                            <span aria-hidden="true">{line.emoji}</span>
                        </span>
                    ))}
                </span>
            </Tooltip.Content>
        </Tooltip>
    );
}

import type { ImageGeneration } from '@haus/api';
import * as React from 'react';
import { MessageMediaStrip } from '../chats/message-media-strip.tsx';
import { ImageGenerationCard } from './image-generation-card.tsx';
import { isReadyImageGeneration } from './image-generation-details.tsx';
import { ImageGenerationLightbox } from './image-generation-lightbox.tsx';

/**
 * Consecutive generation links in one Message, as cards of one size in the
 * stock media strip (so scrolling, edge fade, and arrow-key walking match
 * attachments); a single link is one card in the same strip. The viewer pages
 * the ready images of this strip only. There is no total or summary.
 */
export function ImageGenerationStrip({
    firstIndex = 0,
    generations,
    serverId,
}: {
    /** How many cards earlier strips of the same Message hold, so the entrance staggers across them. */
    firstIndex?: number;
    generations: readonly ImageGeneration[];
    serverId: string;
}) {
    const [viewingId, setViewingId] = React.useState<string | null>(null);
    const ready = generations.filter(isReadyImageGeneration);
    const viewing = ready.findIndex((generation) => generation.id === viewingId);

    return (
        // `mt-1.5` is the step ActionCard (Cloud Agent work) takes below the
        // author line, so a body that opens with a card clears it the same way.
        <div className="mt-1.5 min-w-0">
            <MessageMediaStrip>
                {generations.map((generation, index) => (
                    <ImageGenerationCard
                        generation={generation}
                        index={firstIndex + index}
                        key={generation.id}
                        onOpen={() => setViewingId(generation.id)}
                        serverId={serverId}
                    />
                ))}
            </MessageMediaStrip>
            {viewing >= 0 ? (
                <ImageGenerationLightbox
                    generations={ready}
                    index={viewing}
                    onClose={() => setViewingId(null)}
                    onIndexChange={(index) => setViewingId(ready[index]?.id ?? null)}
                    serverId={serverId}
                />
            ) : null}
        </div>
    );
}

import type { ImageGeneration } from '@haus/api';
import * as React from 'react';
import { MessageMediaStrip } from '../chats/message-media-strip.tsx';
import { ImageGenerationCard } from './image-generation-card.tsx';
import { isReadyImageGeneration } from './image-generation-details.tsx';
import { ImageGenerationLightbox } from './image-generation-lightbox.tsx';

/**
 * Consecutive generation links in one Message. One link is a single card; two
 * or more share a horizontal snap strip (the stock media strip, so scrolling,
 * edge fade, and arrow-key walking match attachments). The viewer pages the
 * ready images of this strip only. There is no total or summary.
 */
export function ImageGenerationStrip({
    generations,
    serverId,
}: {
    generations: readonly ImageGeneration[];
    serverId: string;
}) {
    const [viewingId, setViewingId] = React.useState<string | null>(null);
    const ready = generations.filter(isReadyImageGeneration);
    const viewing = ready.findIndex((generation) => generation.id === viewingId);
    const layout = generations.length > 1 ? 'strip' : 'solo';

    const cards = generations.map((generation) => (
        <ImageGenerationCard
            generation={generation}
            key={generation.id}
            layout={layout}
            onOpen={() => setViewingId(generation.id)}
            serverId={serverId}
        />
    ));

    return (
        <>
            {layout === 'solo' ? cards : <MessageMediaStrip>{cards}</MessageMediaStrip>}
            {viewing >= 0 ? (
                <ImageGenerationLightbox
                    generations={ready}
                    index={viewing}
                    onClose={() => setViewingId(null)}
                    onIndexChange={(index) => setViewingId(ready[index]?.id ?? null)}
                    serverId={serverId}
                />
            ) : null}
        </>
    );
}

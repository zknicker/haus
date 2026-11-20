import type { CSSProperties, Ref } from 'react';
import { useBackgroundImageUrl } from '../../hooks/shell/use-background-image-url.ts';
import { homeBackgroundLayers } from '../../lib/home-background-style.ts';
import { backgroundArt, type ThemeBackground } from '../../lib/home-background.ts';
import { cn } from '../../lib/utils.ts';

export function HomeBackgroundLayers({
    background,
    className,
    ref,
}: {
    background: ThemeBackground;
    className?: string;
    ref?: Ref<HTMLDivElement>;
}) {
    const art = backgroundArt(background);
    const image = useBackgroundImageUrl(art.kind === 'image' ? art.image : null);
    const layers = homeBackgroundLayers(background, image?.status === 'ready' ? image.url : null);
    if (!layers) {
        return null;
    }
    return (
        <div
            aria-hidden="true"
            className={cn('home-background', className)}
            data-art={layers.art}
            data-effect={layers.effect}
            ref={ref}
            style={layers.style as CSSProperties}
        >
            <div className="home-background__art" />
            <div className="home-background__overlay" />
            {layers.effect === 'none' ? null : <div className="home-background__effect" />}
        </div>
    );
}

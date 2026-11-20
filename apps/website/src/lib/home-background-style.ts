import { BODY_PATH, EYES_PATH } from '../components/haus-ghost-paths.ts';
import { backgroundArt, type ThemeBackground } from './home-background.ts';

const maxBlurPx = 32;

export function homeBackgroundLayers(background: ThemeBackground, imageUrl: string | null) {
    const art = backgroundArt(background);
    const paint = artPaint(art, imageUrl);
    if (!paint) {
        return null;
    }
    const { adjustments } = background;
    return {
        art: paint.art,
        effect: background.effect,
        style: {
            '--home-background-art': paint.image,
            '--home-background-blur': `${roundTo((adjustments.blur / 100) * maxBlurPx, 1)}px`,
            '--home-background-brightness': `${adjustments.brightness / 100}`,
            '--home-background-fade': `${adjustments.bottomFade}%`,
            '--home-background-image-opacity': `${adjustments.imageOpacity / 100}`,
            '--home-background-overlay': `${adjustments.overlayOpacity / 100}`,
        },
    };
}

export function homeInputOpacity(background: ThemeBackground) {
    return `${background.adjustments.inputOpacity / 100}`;
}

export const ghostTile = cssUrl(
    `data:image/svg+xml,${encodeURIComponent(
        [
            '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360">',
            ghost('translate(48 40) rotate(-14 96 102) scale(0.3)'),
            ghost('translate(236 150) rotate(11 96 102) scale(0.22)'),
            ghost('translate(96 250) rotate(6 96 102) scale(0.26)'),
            '</svg>',
        ].join('')
    )}`
);

function artPaint(art: ReturnType<typeof backgroundArt>, imageUrl: string | null) {
    if (art.kind === 'pattern') {
        return { art: art.pattern, image: art.pattern === 'ghosts' ? ghostTile : 'none' };
    }
    if (art.kind === 'image' && imageUrl) {
        return { art: 'image' as const, image: cssUrl(imageUrl) };
    }
    return null;
}

function ghost(transform: string) {
    return `<path transform="${transform}" fill-rule="evenodd" d="${BODY_PATH} ${EYES_PATH}"/>`;
}

function cssUrl(url: string) {
    return `url("${url.replaceAll('"', '%22')}")`;
}

function roundTo(value: number, digits: number) {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}

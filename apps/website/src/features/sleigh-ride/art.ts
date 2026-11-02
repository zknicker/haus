import deerSource from './assets/deer.webp';
import sleighSource from './assets/sleigh.webp';
import { dimSheet, type TeamArt } from './draw-team.ts';

/**
 * The painted team (Codex image gen): gallop sheet A's four deer and four
 * Rudolph frames, and the solo sleigh with the nightcap ghost. Decoded once
 * per window, so a later ride never fetches or decodes them again.
 */
let art: Promise<TeamArt | null> | null = null;

/** The decoded team, or null when the art cannot be decoded (the ride then stays home). */
export function loadTeamArt(): Promise<TeamArt | null> {
    art ??= decodeTeamArt();
    return art;
}

async function decodeTeamArt(): Promise<TeamArt | null> {
    try {
        const [deer, sleigh] = await Promise.all([decode(deerSource), decode(sleighSource)]);
        const farDeer = dimSheet(deer);
        return farDeer ? { deer, farDeer, sleigh } : null;
    } catch {
        // Decorative art: a failed decode skips this ride, and the next one tries again.
        art = null;
        return null;
    }
}

async function decode(source: string): Promise<HTMLImageElement> {
    const image = new Image();
    image.decoding = 'async';
    image.src = source;
    await image.decode();
    return image;
}

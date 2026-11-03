import type { DoorColor } from './advent-season.ts';
import goldSource from './assets/door-gold.png';
import greenSource from './assets/door-green.png';
import nicheSource from './assets/door-niche.png';
import redSource from './assets/door-red.png';

/** The painted arched doors (Codex image gen), closed, and the lit niche behind them. */
export const doorArt: Readonly<Record<DoorColor, string>> = {
    gold: goldSource,
    green: greenSource,
    red: redSource,
};

export const nicheArt = nicheSource;

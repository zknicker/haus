import type * as React from 'react';

/**
 * The landing burst under a stamping sticker: a thin ground ring, 18 soft
 * puffs that spread sideways and rise, and 14 small specks that fly out fast.
 * Positions come from a seeded generator so a sticker's burst is the same
 * shape every time it plays. Purely decorative; `prefers-reduced-motion`
 * hides it in CSS.
 */
export function StickerBurst({ seed }: { seed: number }) {
    const particles = burstParticles(seed);

    return (
        <span aria-hidden="true" className="reaction-burst">
            <i className="reaction-burst__ring" />
            {particles.map((particle, index) => (
                <i
                    className={`reaction-burst__${particle.kind}`}
                    // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, positional particle list
                    key={index}
                    style={
                        {
                            '--dx': `${particle.dx}px`,
                            '--dy': `${particle.dy}px`,
                            '--pd': `${particle.delay.toFixed(3)}s`,
                            '--s': `${particle.size}px`,
                        } as React.CSSProperties
                    }
                />
            ))}
        </span>
    );
}

/** The burst was tuned around a 26px sticker; it scales with the 20px one. */
const spread = 20 / 26;

interface BurstParticle {
    delay: number;
    dx: number;
    dy: number;
    kind: 'puff' | 'speck';
    size: number;
}

export function burstParticles(seed: number): BurstParticle[] {
    const random = mulberry32(seed);
    const between = (min: number, max: number) => min + random() * (max - min);
    const integer = (min: number, max: number) => Math.floor(between(min, max + 1));
    const particles: BurstParticle[] = [];

    for (let index = 0; index < 18; index += 1) {
        const side = index % 2 ? -1 : 1;
        const radius = 22 + random() * 48;
        const angle = between(-0.55, 0.35);
        particles.push({
            delay: between(0, 0.08),
            dx: Math.round(side * Math.cos(angle) * radius * spread),
            dy: Math.round(Math.sin(angle) * radius * 0.6 * spread),
            kind: 'puff',
            size: Math.round(integer(9, 24) * spread),
        });
    }
    for (let index = 0; index < 14; index += 1) {
        // Most specks fly up and out; the last few skim sideways along the ground.
        const angle =
            index < 9
                ? between(Math.PI * 1.05, Math.PI * 1.95)
                : random() < 0.5
                  ? between(-0.3, 0.2)
                  : between(Math.PI - 0.2, Math.PI + 0.3);
        const radius = 50 + random() * 45;
        particles.push({
            delay: between(0, 0.05),
            dx: Math.round(Math.cos(angle) * radius * spread),
            dy: Math.round(Math.sin(angle) * radius * 0.8 * spread),
            kind: 'speck',
            size: Math.max(2, Math.round(integer(3, 6) * spread)),
        });
    }

    return particles;
}

function mulberry32(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d_2b_79_f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
}

// The quality sidecar beside each prompt's reply: what the shipped fences did
// in the real frame. `{ layout: string[], console: string[] }`, each message
// prefixed with the fence slug it came from.
//
// run.mjs writes it for every new run; findings-backfill.mjs writes it for
// runs recorded before the lab probed layout. The page only ever reads counts
// and messages off this one shape.

/** `<slug>.findings.json`, beside `<slug>.reply.md`. */
export const findingsFileFor = (slug) => `${slug}.findings.json`;

/** The `.visual.html` files run.mjs wrote for a prompt's fences, in order. */
export const fenceFilesFor = (slug, fenceCount) =>
    Array.from({ length: fenceCount }, (_, index) =>
        index === 0 ? `${slug}.visual.html` : `${slug}-${index + 1}.visual.html`
    );

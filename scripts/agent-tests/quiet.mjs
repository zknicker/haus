import { sleep } from '../eval-harness.mjs';

const quietPollMs = 2000;

export async function waitForQuiet(readState, { label, quietStableMs = 6000, within = 120_000 }) {
    const deadline = Date.now() + within;
    let quietSince = null;
    while (Date.now() < deadline) {
        const state = await readState();
        if (state.running || state.pending > 0) {
            quietSince = null;
        } else {
            quietSince ??= Date.now();
            if (Date.now() - quietSince >= quietStableMs) {
                return;
            }
        }
        await sleep(quietPollMs);
    }
    throw new Error(`${label} never went quiet within ${Math.round(within / 1000)}s.`);
}

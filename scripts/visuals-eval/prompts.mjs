// The visuals eval battery: real operator asks over one fixed MerchBase sales
// payload. Unlike the design battery these prompts carry their own data, so
// the run needs no Haus server and no MCP — the model's only job is to read
// the numbers and render them.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const salesJson = readFileSync(path.join(here, 'fixtures/merchbase-sales.json'), 'utf8').trim();

const dataBlock = `Today is 2026-09-15 and the shop's timezone is America/Los_Angeles. The MerchBase sales data has already been fetched and is below — no tools needed.

\`\`\`json
${salesJson}
\`\`\``;

const asks = {
    'sales-today':
        'Hey @Juniper this is our new home for ops. I just gave you an MCP to take a look at sales, want to test it out? How are sales today?',
    'week-over-week':
        "can u display last week's US sales as a bar chart vs the prior week? then give me the numbers",
};

/** `ask` is the human line alone; `prompt` is that line plus the data block. */
export const visualsBattery = Object.entries(asks).map(([slug, ask]) => ({
    ask,
    kind: 'visual',
    prompt: `${ask}\n\n${dataBlock}`,
    slug,
}));

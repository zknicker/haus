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
    'top-products':
        'which designs actually earned me anything this past week? show me the top ones',
    'marketplace-share':
        'how much of the last 30 days came from each marketplace — US vs UK vs Germany?',
    'weekday-pattern':
        'is there a day of the week that reliably sells better? show me the last month week by week',
    'marketplace-map': 'show me where in the world these sold over the last 30 days',
    'revenue-trend-30d':
        'how has revenue been moving over the last 30 days? just want to see the shape of it',
    'royalties-month-to-date':
        'show me how the royalties have piled up so far this month — running total, day by day',
    'marketplace-daily-units':
        'how do the US, the UK and Germany compare day to day? units for the last two weeks, all three side by side',
    'monthly-marketplace-mix':
        'has the mix between the marketplaces shifted at all? give me the last six months of revenue, split by marketplace',
    'design-movers': 'which designs gained and which ones lost ground vs the week before?',
    'price-vs-units':
        'is price doing anything to how much a design sells? take the whole catalog, and let me see which ones actually bring in the money',
    'category-share':
        'quick sense of the split — what share of units did each product category take over the last 30 days?',
    'units-and-royalties-7d': 'show me units and royalties per day for the last 7 days',
    'units-vs-dollars-combo':
        'can I get the usual combined chart — bars for units, line for $ sales, left axis units, right axis $, last 7 days, returns/cancels excluded',
    'headline-numbers-7d':
        'give me the last 7 days at a glance — the four numbers I care about (revenue, royalties, net units, returns) as tiles, each with how it moved vs the week before. no chart under them.',
    'marketplace-glance': "how's each marketplace doing at a glance",
    'monthly-goal-progress': 'how close am I to my $30K monthly revenue goal?',
    'account-health': 'anything I should worry about — returns, cancellations, stale sync?',
};

/** `ask` is the human line alone; `prompt` is that line plus the data block. */
export const visualsBattery = Object.entries(asks).map(([slug, ask]) => ({
    ask,
    kind: 'visual',
    prompt: `${ask}\n\n${dataBlock}`,
    slug,
}));

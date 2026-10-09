import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { recordAppTraffic } from './app-traffic.ts';
import {
    installRenderCounter,
    type RenderTally,
    resetRenders,
    settleRenders,
    topComponents,
} from './render-counter.ts';

/**
 * Checks a scenario's component renders against the ratchet in
 * e2e/render-budgets.json: more than 20% over its budget fails with the top
 * components; more than 20% under prints a hint to lower the budget. Set
 * `HAUS_RENDER_BUDGET_RECORD=<file>` to append measurements (JSON lines)
 * instead of asserting, to reseed budgets from several runs.
 */
type Layout = 'desktop' | 'web';
type Budgets = Record<Layout, Record<string, number>>;

const budgetFile = fileURLToPath(new URL('../render-budgets.json', import.meta.url));
const tolerance = 0.2;
/** Tiny budgets get a small absolute allowance, so one stray commit is not a failure. */
const minimumSlack = 3;

/**
 * Installs the render counter and a traffic recorder; call before the page
 * loads. `measure` waits for renders and Server traffic to go quiet, runs the
 * action, and checks the renders it caused against the scenario's budget.
 */
export async function installRenderBudget(page: Page, testInfo: TestInfo, layout: Layout) {
    await installRenderCounter(page);
    const traffic = recordAppTraffic(page);
    return {
        measure: async (name: string, action: () => Promise<void>) => {
            // Longer than the 1 s read-receipt settle (chat-read-cache.ts), so a
            // previous step's trailing reads and renders never land in this one.
            await traffic.settled({ quietMs: 1500 });
            await settleRenders(page, 1500);
            await resetRenders(page);
            await action();
            await traffic.settled({ quietMs: 600 });
            const tally = await settleRenders(page);
            checkBudget(testInfo, { layout, name }, tally);
        },
    };
}

function checkBudget(
    testInfo: TestInfo,
    scenario: { layout: Layout; name: string },
    tally: RenderTally
) {
    const record = process.env.HAUS_RENDER_BUDGET_RECORD;
    if (record) {
        appendFileSync(
            record,
            `${JSON.stringify({ ...scenario, top: tally.byName, total: tally.total })}\n`
        );
        return;
    }
    const budgets = readBudgets()[scenario.layout];
    const budget = budgets[scenario.name];
    const label = `${scenario.layout}/${scenario.name}`;
    if (budget === undefined) {
        expect
            .soft(Object.keys(budgets), `${label} needs a budget in e2e/render-budgets.json`)
            .toContain(scenario.name);
        return;
    }
    const limit = Math.max(Math.ceil(budget * (1 + tolerance)), budget + minimumSlack);
    testInfo.annotations.push({
        description: `${tally.total} renders (budget ${budget}, limit ${limit})`,
        type: label,
    });
    if (tally.total < budget * (1 - tolerance) && budget - tally.total > minimumSlack) {
        console.log(
            `[render-budget] ${label}: ${tally.total} renders, well under its budget of ${budget}. ` +
                'Ratchet it down in apps/website/e2e/render-budgets.json (p90 of several runs + a small margin).'
        );
    }
    expect
        .soft(
            tally.total,
            [
                `${label} rendered ${tally.total} components, over its budget of ${budget} (limit ${limit}).`,
                'Top components:',
                topComponents(tally),
                'A kept view or shared provider is re-rendering for a change it does not show.',
                'Narrow the subscription (select, a leaf reader, stable callbacks); see',
                '.agents/skills/perf-haus-app/references/learnings.md "Render storms".',
            ].join('\n')
        )
        .toBeLessThanOrEqual(limit);
}

function readBudgets(): Budgets {
    return JSON.parse(readFileSync(budgetFile, 'utf8')) as Budgets;
}

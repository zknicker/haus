// The lineup the lab compares — deliberately separate from the app's own
// runtime registry so a contender can be added or dropped without touching
// product code.
//
// Every model runs on the Agent runner's harness, the lane Haus actually ships:
// `runtime` is the model's family id in apps/runner/src/model-catalog.ts, and a
// run spends the dev Server's Model connection for that provider.
//
// `reasoning` is the effort a run starts at; the page can override it per model
// before a run, which is why it lives here as a default rather than a constant.
//
// The page's columns are these models crossed with the skills: see
// columns.mjs.
export const models = [
    {
        id: 'grok-4-7',
        label: 'Grok 4.7',
        model: 'grok-4.7',
        reasoning: 'medium',
        runtime: 'grok-build',
    },
    {
        id: 'sol-6-1',
        label: 'Sol 6.1',
        model: 'gpt-6.1-sol',
        reasoning: 'medium',
        runtime: 'codex',
    },
    {
        id: 'opus-5-5',
        label: 'Opus 5.5',
        model: 'claude-opus-5-5',
        reasoning: 'medium',
        runtime: 'claude-code',
    },
    {
        id: 'fable-5-2',
        label: 'Fable 5.2',
        model: 'claude-fable-5-2',
        reasoning: 'medium',
        runtime: 'claude-code',
    },
    {
        id: 'gemini-flash',
        label: 'Gemini 3.8 Flash',
        model: 'gemini-3.8-flash',
        reasoning: 'medium',
        runtime: 'gemini',
    },
    {
        id: 'gemini-flash-lite',
        label: 'Gemini 3.5 Flash-Lite',
        model: 'gemini-3.5-flash-lite',
        reasoning: 'medium',
        runtime: 'gemini',
    },
];

/** The effort levels the page offers and the run script accepts. */
export const efforts = ['low', 'medium', 'high'];

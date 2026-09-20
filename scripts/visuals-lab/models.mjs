// The lineup the lab compares — deliberately separate from the app's own
// runtime registry so a contender can be added or dropped without touching
// product code.
//
// Every model runs the product's harness bridge, the lane Haus actually ships.
// There used to be a second lane spawning the CLIs installed on this Mac,
// because the pinned bridges rejected `gpt-6-astra` and `claude-fable-5-1`;
// the bridge upgrade landed, so that lane is gone.
//
// `reasoning` is the effort a run starts at; the page can override it per model
// before a run, which is why it lives here as a default rather than a constant.
export const models = [
    {
        id: 'grok',
        label: 'Grok 4.6',
        model: 'grok-4.6',
        reasoning: 'medium',
        runtime: 'grok-build',
    },
    {
        id: 'sol',
        label: 'Sol',
        model: 'gpt-5.6-sol',
        reasoning: 'medium',
        runtime: 'codex',
    },
    {
        id: 'astra',
        label: 'Astra',
        model: 'gpt-6-astra',
        reasoning: 'medium',
        runtime: 'codex',
    },
    {
        id: 'opus',
        label: 'Opus 4.8',
        model: 'claude-opus-4-8',
        reasoning: 'medium',
        runtime: 'claude-code',
    },
    {
        id: 'fable',
        label: 'Fable 5.1',
        model: 'claude-fable-5-1',
        reasoning: 'medium',
        runtime: 'claude-code',
    },
];

/** The effort levels the page offers and the run script accepts. */
export const efforts = ['low', 'medium', 'high'];

export const modelById = (id) => models.find((model) => model.id === id) ?? null;

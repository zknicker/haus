// Agent instructions for a visuals lab run.
//
// The lab deliberately does NOT use composeAgentInstructions: the product
// prompt tells the Agent to publish through `haus message send`, and this
// harness has no Haus server, no CLI, and no chat. Everything the Agent needs
// here is the visuals pointer plus a replaced Outputs rule that puts the fence
// in the reply body.
//
// `visualsPointer` is a verbatim copy of the module-private `visualsSection`
// in apps/computer/src/harness/managed-instructions.ts. instructions.test.ts
// pins it as a substring of the rendered product prompt so it cannot drift.

export const visualsPointer = `## Visuals

Numbers over time or across categories get an inline visual (bespoke HTML/SVG) by default; keepable deliverables get artifact pages. Before emitting either fence, read the visuals skill: it says when not to render, the fence contracts, and the design system. Never output HTML, JSX, CSS, imports, or class names in plain message text.`;

// The no-CLI rule is exactly what every pre-preview run was given, so a plain
// column's prompt does not move. A `--preview` run puts a `haus` shim on PATH
// (harness-runner.mjs) whose only working group is `haus visual`, so its rule
// names that one command instead.
const cliRules = {
    none: 'There is no `haus message send` here and no haus CLI; do not try to run it.',
    preview:
        'There is no `haus message send` here; the only haus command that works is `haus visual preview`.',
};

/** The lab's whole prompt: the visuals pointer plus an Outputs rule that keeps the fence in the reply. */
export const labInstructionsFor = ({ preview = false } = {}) => `${visualsPointer}

## Outputs

- Fences render directly in your reply: write the \`\`\`visual fence in the body of your final assistant message. ${preview ? cliRules.preview : cliRules.none}
- Text goes in your reply, the visual goes in the fence.`;

// Agent instructions for a visuals lab run.
//
// The lab deliberately does NOT use renderAgentInstructions: the product
// prompt tells the Agent to publish through `haus message send` and to open
// skills with `haus skill view`, and this harness has no Haus Server, no CLI,
// and no chat. Everything the Agent needs here is the visuals pointer, a
// replaced Outputs rule that puts the fence in the reply body, and the skill
// listing pointed at the skill files on the lab machine.
//
// `visualsPointer` is a verbatim copy of the module-private `visualsSection`
// in packages/agent-prompt/src/managed-instructions.ts. instructions.test.ts
// pins it as a substring of the rendered product prompt so it cannot drift.

export const visualsPointer = `## Visuals

Numbers over time or across categories get an inline visual (bespoke HTML/SVG) by default; full documents get pages. Before emitting either fence, read the visuals skill: it says when not to render, the fence contracts, and the design system. Never output HTML, JSX, CSS, imports, or class names in plain message text.`;

const outputsSection = `## Outputs

- Fences render directly in your reply: write the \`\`\`visual fence in the body of your final assistant message. There is no \`haus message send\` here and no haus CLI; do not try to run it.
- Text goes in your reply, the visual goes in the fence.`;

/**
 * The run's instructions and skill listing, as the runner's launch carries
 * them. `skills` are `{ name, description }` entries; `skillsPath` is the
 * skills folder relative to the Agent's working directory.
 */
export function labInstructions({ skills, skillsPath }) {
    const rows = skills.map((skill) => `- ${skill.name}: ${skill.description}`).join('\n');
    const skillListing = `## Skills

Your skills, by name and description. Before work one covers, read its \`SKILL.md\` under \`${skillsPath}/<name>/\` in your working directory and follow it; its references sit beside it.

${rows}`;
    return {
        instructions: `${visualsPointer}\n\n${outputsSection}\n\n${skillListing}\n`,
        skillListing,
    };
}

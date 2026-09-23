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

const outputsSection = `## Outputs

- Fences render directly in your reply: write the \`\`\`visual fence in the body of your final assistant message. There is no \`haus message send\` here and no haus CLI; do not try to run it.
- Text goes in your reply, the visual goes in the fence.`;

export const labInstructions = `${visualsPointer}\n\n${outputsSection}`;

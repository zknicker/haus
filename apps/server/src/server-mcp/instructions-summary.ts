import { mcpSummarySchema } from '@haus/api';

/**
 * The opening line of a server's `instructions`, as its description.
 *
 * `instructions` is written for a model — DeepWiki returns a 2,500-character
 * catalog of every tool it offers. The first line is the part that reads as a
 * description to a person; anything past it is guidance, not identity.
 */
export function summarizeInstructions(instructions: unknown): string | null {
    if (typeof instructions !== 'string') {
        return null;
    }
    const firstLine = instructions
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0);
    if (!firstLine) {
        return null;
    }
    const parsed = mcpSummarySchema.safeParse(
        firstLine.length > 200 ? `${firstLine.slice(0, 199).trimEnd()}…` : firstLine
    );
    return parsed.success ? parsed.data : null;
}

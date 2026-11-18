import { describe, expect, test } from 'bun:test';
import { agentRuntimeAgentEnvVariableSchema } from './contracts.ts';

const parse = (name: string) =>
    agentRuntimeAgentEnvVariableSchema.safeParse({ hasValue: false, name });

describe('agent environment variable names', () => {
    test('reserves the names Haus manages for itself', () => {
        // Every project-owned Haus variable carries this prefix, so an agent
        // may not shadow one. The reserved prefix moved with the rename; an
        // operator can set UNRELATED_* again precisely because Haus no longer
        // uses it.
        expect(parse('HAUS_SERVER_URL').success).toBe(false);
        expect(parse('HAUS_').success).toBe(false);
        expect(parse('OPENAI_API_KEY').success).toBe(false);
        expect(parse('OPENROUTER_API_KEY').success).toBe(false);
    });

    test('accepts an operator name that Haus does not own', () => {
        expect(parse('ACME_API_KEY').success).toBe(true);
        expect(parse('UNRELATED_LEGACY').success).toBe(true);
    });
});

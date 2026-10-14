import { describe, expect, it } from 'bun:test';
import { agentRuntimeRunJobInputSchema } from './contracts.ts';

describe('Runtime job contracts', () => {
    it('defaults job run input to an empty payload', () => {
        expect(agentRuntimeRunJobInputSchema.parse({})).toEqual({});
        expect(
            agentRuntimeRunJobInputSchema.parse({
                payload: {
                    stale: true,
                },
            })
        ).toEqual({
            payload: {
                stale: true,
            },
        });
    });
});

import { expect, test } from 'bun:test';
import { curatedModels } from '../../apps/runner/src/model-catalog.ts';
import { models } from './models.mjs';

test('every lab model is one the Agent runner offers', () => {
    const offered = curatedModels.flatMap((family) =>
        family.modelIds.map((modelId) => `${family.id}/${modelId}`)
    );

    expect(offered).toEqual(
        expect.arrayContaining(models.map((model) => `${model.runtime}/${model.model}`))
    );
});

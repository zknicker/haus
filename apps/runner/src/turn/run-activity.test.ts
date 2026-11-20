import { expect, test } from 'bun:test';
import { toolCategory } from './run-activity.ts';

test('web tools show as browsing and searching on every harness', () => {
    expect(
        ['WebFetch', 'webSearch', 'web_fetch', 'web_search', 'execute'].map((name) =>
            toolCategory(name, {})
        )
    ).toEqual(['browsing', 'searching_web', 'browsing', 'searching_web', 'using_tool']);
});

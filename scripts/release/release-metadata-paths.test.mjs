import { expect, test } from 'bun:test';
import { releaseMetadataPaths } from './release-metadata-paths.mjs';

test('publisher accepts every file changed by the coordinated release bump', () => {
    expect(releaseMetadataPaths).toEqual([
        'CHANGELOG.md',
        'apps/ios-swift/Haus.xcodeproj/project.pbxproj',
        'apps/ios-swift/project.yml',
        'apps/computer/package.json',
        'apps/website/package.json',
        'bun.lock',
        'packages/haus-api/haus-agent.json',
        'packages/haus-api/haus-product.json',
        'releases.json',
    ]);
});

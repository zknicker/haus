import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRequiredTargetsSelected, calculateReleaseImpact } from './release-impact.mjs';

for (const file of [
    'apps/hosted-mcp/hosted/managed.py',
    'apps/hosted-mcp/uv.lock',
    'apps/hosted-mcp-linear/src/main.ts',
    'scripts/package-hosted-mcp.mjs',
    'scripts/build-haus-server-artifact.mjs',
]) {
    test(`${file} requires its owning Server release`, async () => {
        const impact = await calculateReleaseImpact({
            ledger: [
                {
                    version: '1.0.0',
                    date: '2026-10-11',
                    targets: {
                        server: '1.0.0',
                        app: '1.0.0',
                        ios: { version: '1.0.0', buildNumber: 1 },
                        computer: '1.0.0',
                        agent: '1.0.0',
                    },
                },
            ],
            resolveTag: async () => 'a'.repeat(40),
            listChangedFiles: async () => [file],
        });
        assert.equal(impact.targets.server.status, 'required');
        assert.deepEqual(impact.targets.server.requiredFiles, [file]);
        assert.throws(
            () => assertRequiredTargetsSelected({ impact, selectedTargets: { server: false } }),
            /server:/u
        );
    });
}

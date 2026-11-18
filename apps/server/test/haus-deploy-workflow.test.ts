import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const workflowPath = join(repoRoot, '.github/workflows/deploy-haus-server.yml');

interface Step {
    name?: string;
    run?: string;
}

test('a deploy verifies, renders, migrates once, then activates, holding one platform secret', () => {
    const source = readFileSync(workflowPath, 'utf8');
    const workflow = parse(source) as {
        concurrency: { 'cancel-in-progress': boolean; group: string };
        jobs: { deploy: { steps: Step[] } };
    };
    const steps = workflow.jobs.deploy.steps;
    const commands = steps.flatMap((step) => step.run ?? []).join('\n');
    const step = (name: string) => steps.find((candidate) => candidate.name === name)?.run ?? '';

    expect(workflow.concurrency).toEqual({ 'cancel-in-progress': false, group: 'haus-production' });
    const workflowSecrets = new Set(
        [...source.matchAll(/secrets\.([A-Z][A-Z0-9_]*)/gu)].map((m) => m[1])
    );
    expect([...workflowSecrets]).toEqual(['GH_DEPLOY_AGENT_PRODUCTION_OP_TOKEN']);

    const order = [
        'verify-haus-server-release',
        'render-server-env',
        '/bin/haus-server-migrate',
        '/usr/local/libexec/haus/activate-haus-server',
    ].map((command) => commands.indexOf(command));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    const deploy = step('Deploy downloaded release');
    expect(deploy.indexOf('/usr/bin/shasum -a 256 -c')).toBeGreaterThanOrEqual(0);
    expect(deploy.indexOf('/usr/bin/shasum -a 256 -c')).toBeLessThan(
        deploy.indexOf('./bin/haus-server-deploy')
    );
    expect(step('Render the Server environment')).toContain('until bunx varlock');
    expect(step('Apply database migrations')).not.toContain('until ');
});

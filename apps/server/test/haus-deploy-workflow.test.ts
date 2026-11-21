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

test('a deploy builds the runner from the release tree before activation and rolls it back on failure', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8')) as {
        jobs: {
            deploy: {
                steps: (Step & { if?: string; uses?: string; with?: Record<string, unknown> })[];
            };
        };
    };
    const steps = workflow.jobs.deploy.steps;
    const names = steps.map((step) => step.name ?? '');
    const named = (name: string) => steps.find((step) => step.name === name);
    const checkout = steps.find((step) => step.uses?.startsWith('actions/checkout'));
    const build = named('Build the Agent runner image')?.run ?? '';
    const start = named('Start the Agent runner')?.run ?? '';
    const rollback = named('Roll the Agent runner back');

    expect(checkout?.with?.ref).toBeUndefined();
    expect(build).toMatch(/git archive "\$\{HAUS_SOURCE_REVISION\}"/u);
    expect(build).toContain('build haus-runner');
    expect(names.indexOf('Build the Agent runner image')).toBeLessThan(
        names.indexOf('Apply database migrations')
    );
    expect(names.indexOf('Prove local Server health')).toBeLessThan(
        names.indexOf('Start the Agent runner')
    );
    expect(start).toContain('HAUS_RUNNER_REPLACED=true');
    expect(start).toContain('--no-build --force-recreate --wait haus-runner');
    const proof = named('Prove the runner reaches only the Server')?.run ?? '';
    expect(proof).toContain('docker exec -u haus-runner haus-runner');
    expect(proof).toContain('/app/apps/runner/container/prove-network-deny.sh');
    const prune = named('Prune old runner images')?.run ?? '';
    expect(names.indexOf('Prove the runner reaches only the Server')).toBeLessThan(
        names.indexOf('Prune old runner images')
    );
    expect(prune).toContain('HAUS_RUNNER_PREVIOUS_IMAGE');
    expect(prune).toContain('docker image rm');
    expect(prune).toContain('::warning::');
    expect(names.at(-1)).toBe('Roll the Agent runner back');
    expect(rollback?.if).toBe("failure() && env.HAUS_RUNNER_REPLACED == 'true'");
    expect(rollback?.run).toContain('docker rm -f haus-runner');
    expect(rollback?.run).toMatch(/HAUS_RUNNER_IMAGE_TAG="\$\{previous_tag\}"/u);
});

import { join } from 'node:path';

export const skoolHostedUrl = 'https://hosted-mcp.haus.invalid/skool/mcp';

export interface HostedMcpDefinition {
    command: readonly [string, ...string[]];
    cwd: string;
    environment: NodeJS.ProcessEnv;
    id: string;
}

export function skoolHostedDefinition(packageRoot: string): HostedMcpDefinition {
    const pythonRoot = join(packageRoot, 'python');
    return {
        id: 'skool',
        command: [join(pythonRoot, 'bin/python3.12'), '-m', 'hosted.managed'],
        cwd: packageRoot,
        environment: {
            PATH: '/usr/bin:/bin',
            PYTHONHOME: pythonRoot,
            PYTHONPATH: packageRoot,
            PYTHONUNBUFFERED: '1',
            PYTHONDONTWRITEBYTECODE: '1',
        },
    };
}

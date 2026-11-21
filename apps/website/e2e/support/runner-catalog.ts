import { runnerSocketPath } from '@haus/api';
import { WebSocket } from 'ws';

export const e2eRunnerToken = `e2e-runner-token-${'r'.repeat(40)}`;

export const e2eRunnerRuntimes = [
    {
        id: 'codex',
        label: 'Codex',
        models: [
            { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
            {
                defaultReasoningEffort: 'medium',
                id: 'gpt-5.6-terra',
                label: 'GPT-5.6 Terra',
                reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
            },
        ],
    },
    { id: 'claude', label: 'Claude', models: [{ id: 'claude-opus', label: 'Opus' }] },
];

export function reportRunnerCatalog(serverPort: string) {
    const socket = new WebSocket(`ws://127.0.0.1:${serverPort}${runnerSocketPath}`);
    const rotationId = crypto.randomUUID();
    const reported = new Promise<void>((resolve, reject) => {
        socket.once('error', reject);
        socket.once('close', (code, reason) => {
            reject(new Error(`The runner socket closed ${code}: ${reason.toString()}`));
        });
        socket.on('message', (raw) => {
            const frame = JSON.parse(raw.toString()) as { rotationId?: string; type: string };
            if (frame.type === 'runner-hello-accepted') {
                socket.send(
                    JSON.stringify({
                        harnesses: ['claude-agent-sdk', 'pi-durable'],
                        runtimes: e2eRunnerRuntimes,
                        type: 'runner-inventory',
                    })
                );
                socket.send(
                    JSON.stringify({
                        baseVersion: 1,
                        connectionId: 'mc_inventory_barrier',
                        credential: { access: 'barrier', expires: 0, refresh: 'barrier' },
                        previousRefresh: 'barrier',
                        rotationId,
                        type: 'runner-connection-credential',
                    })
                );
            }
            if (
                frame.type === 'runner-connection-credential-ack' &&
                frame.rotationId === rotationId
            ) {
                socket.removeAllListeners('close');
                socket.close();
                resolve();
            }
        });
        socket.once('open', () => {
            socket.send(JSON.stringify({ token: e2eRunnerToken, type: 'runner-hello' }));
        });
    });
    return reported;
}

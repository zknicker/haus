import { randomBytes } from 'node:crypto';
import { connect, type Socket } from 'node:net';

/**
 * A minimal WebSocket client over raw TCP that never answers ping frames —
 * the shape of a Computer that went silent (sleep, network loss) without
 * closing its socket. Ordinary WebSocket clients always auto-answer pings.
 */
export interface SilentComputerSocket {
    /** Sends a client close frame and ends the TCP stream in the same write. */
    closeAfter(text: string): void;
    readonly ended: Promise<void>;
    send(text: string): void;
}

export async function openSilentComputerSocket(url: URL): Promise<SilentComputerSocket> {
    const tcp = connect(Number(url.port), url.hostname);
    const ended = new Promise<void>((resolve) => {
        tcp.once('close', () => resolve());
    });
    await new Promise<void>((resolve, reject) => {
        tcp.once('connect', () => resolve());
        tcp.once('error', reject);
    });
    tcp.write(
        [
            `GET ${url.pathname} HTTP/1.1`,
            `Host: ${url.host}`,
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}`,
            'Sec-WebSocket-Version: 13',
            '',
            '',
        ].join('\r\n')
    );
    await upgraded(tcp);
    return {
        closeAfter: (text) => {
            tcp.end(Buffer.concat([clientFrame(0x1, Buffer.from(text)), clientFrame(0x8)]));
        },
        ended,
        send: (text) => {
            tcp.write(clientFrame(0x1, Buffer.from(text)));
        },
    };
}

function upgraded(tcp: Socket) {
    return new Promise<void>((resolve, reject) => {
        let head = '';
        const onData = (chunk: Buffer) => {
            head += chunk.toString('latin1');
            if (!head.includes('\r\n\r\n')) {
                return;
            }
            tcp.off('data', onData);
            // Keep draining server frames (including pings) without answering them.
            tcp.on('data', () => undefined);
            if (head.startsWith('HTTP/1.1 101')) {
                resolve();
            } else {
                reject(new Error(`WebSocket upgrade failed: ${head.split('\r\n')[0]}`));
            }
        };
        tcp.on('data', onData);
    });
}

function clientFrame(opcode: number, payload: Buffer = Buffer.alloc(0)) {
    const mask = randomBytes(4);
    const length = payload.length;
    const header =
        length < 126
            ? Buffer.from([0x80 | opcode, 0x80 | length])
            : Buffer.from([0x80 | opcode, 0x80 | 126, length >> 8, length & 0xff]);
    const masked = Buffer.from(payload.map((byte, index) => byte ^ (mask[index % 4] ?? 0)));
    return Buffer.concat([header, mask, masked]);
}

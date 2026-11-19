import type { ComputerSystemEvent } from '@haus/api';

export function systemEventLabel(event: ComputerSystemEvent) {
    switch (event.type) {
        case 'connected':
            return 'Connected to Server';
        case 'disconnected':
            return 'Disconnected from Server';
        case 'management-command':
            return commandEventLabel(event.command);
    }
}

function commandEventLabel(
    command: Extract<ComputerSystemEvent, { type: 'management-command' }>['command']
) {
    switch (command) {
        case 'start':
            return 'Device started';
        case 'stop':
            return 'Device stopped';
        case 'restart':
            return 'Device restarted';
        case 'upgrade':
            return 'Device upgraded';
        case 'rollback':
            return 'Device rolled back';
    }
}

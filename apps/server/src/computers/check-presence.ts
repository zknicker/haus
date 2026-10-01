import type { HausDatabase } from '../postgres/connection.ts';
import type { HausUser } from '../users/haus-user.ts';
import type { ComputerConnections } from './connections.ts';
import { listServerComputers } from './service.ts';

/**
 * Lists a Server's Computers after probing every live attachment in parallel,
 * so presence reflects sockets that answer now rather than ones that have not
 * yet hit the routine heartbeat timeout. Unanswered probes reap their socket.
 */
export async function checkServerComputerPresence(
    db: HausDatabase,
    connections: ComputerConnections,
    member: HausUser | null,
    serverId: string
) {
    const computers = await listServerComputers(db, connections, member, serverId);
    await Promise.all(computers.map((computer) => connections.probe(computer.id)));
    return listServerComputers(db, connections, member, serverId);
}

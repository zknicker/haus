import { createHomedAgent } from './agent-home.fixture.ts';
import {
    connectComputer,
    digest,
    type FrameClient,
    type InvocationHarness,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import type { HausClient } from './haus-client.ts';
import { addMember } from './model-connection.fixture.ts';

/**
 * Two Computers on one Server: the Owner attached the Studio, home to Orbit
 * and Peer; Bea, a plain member, attached the Laptop. Cal is an Admin who
 * attached neither.
 */
export interface AgentAccessBoard {
    admin: HausClient;
    attacher: HausClient;
    attacherUserId: string;
    close(): Promise<void>;
    laptop: FrameClient;
    laptopCredential: string;
    laptopId: string;
    peerAgentId: string;
    setup: InvocationHarness;
}

export async function startAgentAccessBoard(slug: string) {
    const setup = await startInvocationHarness({ slug });
    const { harness, serverId } = setup;
    await harness.sql`
        update computers set reported_inventory = reported_inventory || '{"name":"Studio"}'::jsonb
        where id = ${setup.computerId}
    `;
    const attacherSubject = `user_${slug.replaceAll('-', '_')}_bea`;
    const adminSubject = `user_${slug.replaceAll('-', '_')}_cal`;
    const attacher = await addMember(harness, setup, attacherSubject);
    const admin = await addMember(harness, setup, adminSubject);
    const attacherUserId = harness.humans.userIdForSubject(attacherSubject);
    await harness.sql`
        update server_memberships set role = 'admin'
        where server_id = ${serverId} and user_id = ${harness.humans.userIdForSubject(adminSubject)}
    `;
    const laptopId = `cmp_${slug.replaceAll('-', '').padEnd(15, 'y').slice(0, 15)}l`;
    const laptopCredential = `computer-credential-${slug}-laptop`;
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, operating_system, health)
        values (
            ${laptopId}, ${serverId}, ${attacherUserId}, ${digest(laptopCredential)},
            ${{ name: 'Laptop', runtimes: [] }}::jsonb, 'darwin', 'healthy'
        )
    `;
    const laptop = await connectComputer(harness, laptopCredential);
    const peerAgentId = (
        await createHomedAgent(setup.owner, {
            computerId: setup.computerId,
            displayName: 'Peer',
            handle: 'peer',
            modelId: 'gpt-5.6-sol',
            reasoningEffort: 'high',
            runtimeId: 'codex',
            serverId,
        })
    ).agent.id;
    const board: AgentAccessBoard = {
        admin,
        attacher,
        attacherUserId,
        close: async () => {
            laptop.close();
            attacher.close();
            admin.close();
            await setup.close();
        },
        laptop,
        laptopCredential,
        laptopId,
        peerAgentId,
        setup,
    };
    return board;
}

export function accessInput(board: AgentAccessBoard, agentId = board.setup.agentId) {
    return { agentId, computerId: board.laptopId, serverId: board.setup.serverId };
}

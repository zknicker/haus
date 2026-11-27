import { createTestCaptain } from './captains.ts';
import { type createClient, runPsql } from './server.ts';

export async function seedArtifactReply(client: ReturnType<typeof createClient>, input: SeedInput) {
    const agentId = await createTestCaptain(client, {
        databaseUrl: input.databaseUrl,
        displayName: 'Artifact Auditor',
        handle: 'artifact-auditor',
        serverId: input.serverId,
    });
    runPsql(
        input.databaseUrl,
        `begin;
         insert into chat_messages (
           id, server_id, chat_id, sequence, author_user_id, content, nonce
         )
         select
           'msg_e2e_artifact_anchor', '${input.serverId}', '${input.chatId}',
           last_message_sequence + 1,
           (
             select user_id from server_memberships
             where server_id = '${input.serverId}' and role = 'owner'
           ),
           'Agent artifact fixture', 'e2e-artifact-anchor'
         from chats
         where server_id = '${input.serverId}' and id = '${input.chatId}';
         update chats set last_message_sequence = last_message_sequence + 1
         where server_id = '${input.serverId}' and id = '${input.chatId}';
         insert into chat_messages (
           id, server_id, chat_id, sequence, author_agent_id, content, nonce,
           reply_to_message_id, reply_root_message_id
         )
         select
           'msg_e2e_artifact_reply', '${input.serverId}', '${input.chatId}',
           last_message_sequence + 1,
           '${agentId}',
           E'Here is the audit.\\n\\u0060\\u0060\\u0060page\\n{"path":"audits/deterministic.html","title":"Deterministic workspace audit"}\\n\\u0060\\u0060\\u0060',
           'e2e-artifact-reply', 'msg_e2e_artifact_anchor', 'msg_e2e_artifact_anchor'
         from chats
         where server_id = '${input.serverId}' and id = '${input.chatId}';
         update chats set last_message_sequence = last_message_sequence + 1
         where server_id = '${input.serverId}' and id = '${input.chatId}';
         commit;`
    );
}

interface SeedInput {
    chatId: string;
    databaseUrl: string;
    serverId: string;
}

export async function seedReferenceFixture(
    client: ReturnType<typeof createClient>,
    input: SeedInput
) {
    const captain = (displayName: string, handle: string) =>
        createTestCaptain(client, {
            databaseUrl: input.databaseUrl,
            displayName,
            handle,
            serverId: input.serverId,
        });
    const blippyId = await captain('Blippy', 'blippy');
    const tinyId = await captain('Tiny', 'tiny');
    runPsql(
        input.databaseUrl,
        `begin;
         insert into chats (id, server_id, kind, is_all, name)
         values ('cht_e2e_product', '${input.serverId}', 'channel', false, 'product');
         insert into channel_participants (server_id, chat_id, user_id)
         select '${input.serverId}', 'cht_e2e_product', user_id
         from server_memberships
         where server_id = '${input.serverId}' and role = 'owner';
         insert into chat_messages (
           id, server_id, chat_id, sequence, author_agent_id, content, nonce
         )
         select
           'msg_e2e_reference', '${input.serverId}', '${input.chatId}',
           last_message_sequence + 1,
           '${blippyId}',
           'Coordinate with [@blippy](agent://${blippyId}), [@tiny](agent://${tinyId}), and [#product](chat://cht_e2e_product).',
           'e2e-reference-message'
         from chats
         where server_id = '${input.serverId}' and id = '${input.chatId}';
         update chats set last_message_sequence = last_message_sequence + 1
         where server_id = '${input.serverId}' and id = '${input.chatId}';
         commit;`
    );
}

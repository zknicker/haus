import { runPsql } from './server.ts';

export function seedArtifactReply(input: SeedInput) {
    runPsql(
        input.databaseUrl,
        `begin;
         insert into agents (
           id, server_id, handle, display_name, home_timezone, home_project_id
         ) values (
           'agt_e2e_artifact', '${input.serverId}', 'artifact-auditor',
           'Artifact Auditor', 'America/New_York', '${input.homeProjectId}'
         );
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
           'agt_e2e_artifact',
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
    homeProjectId: string;
    serverId: string;
}

export function seedReferenceFixture(input: SeedInput) {
    runPsql(
        input.databaseUrl,
        `begin;
         insert into computers (
           id, server_id, attached_by_user_id, credential_hash, health
         ) values
           (
             'cmp_e2e_ref_blippy00', '${input.serverId}',
             (select user_id from server_memberships where server_id = '${input.serverId}' and role = 'owner'),
             repeat('a', 64), 'offline'
           ),
           (
             'cmp_e2e_ref_tiny0000', '${input.serverId}',
             (select user_id from server_memberships where server_id = '${input.serverId}' and role = 'owner'),
             repeat('b', 64), 'offline'
           );
         insert into agents (
           id, server_id, computer_id, handle, display_name, home_timezone,
           desired_runtime_id, desired_model_id, home_project_id
         ) values
           (
             'agt_e2e_blippy', '${input.serverId}', 'cmp_e2e_ref_blippy00',
             'blippy', 'Blippy', 'America/New_York', 'codex', 'gpt-5.6-sol', '${input.homeProjectId}'
           ),
           (
             'agt_e2e_tiny', '${input.serverId}', 'cmp_e2e_ref_tiny0000',
             'tiny', 'Tiny', 'America/New_York', 'codex', 'gpt-5.6-sol', '${input.homeProjectId}'
           );
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
           'agt_e2e_blippy',
           'Coordinate with [@blippy](agent://agt_e2e_blippy), [@tiny](agent://agt_e2e_tiny), and [#product](chat://cht_e2e_product).',
           'e2e-reference-message'
         from chats
         where server_id = '${input.serverId}' and id = '${input.chatId}';
         update chats set last_message_sequence = last_message_sequence + 1
         where server_id = '${input.serverId}' and id = '${input.chatId}';
         commit;`
    );
}

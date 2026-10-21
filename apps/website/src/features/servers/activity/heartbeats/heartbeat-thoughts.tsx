import type { Chat } from '@haus/api';
import { Link } from 'react-router-dom';
import { useListedChat } from '../../../../hooks/servers/use-chats.ts';
import { HeartbeatDreamLink } from './heartbeat-dream-link.tsx';
import { type FeedPost, readFollowUpCount } from './heartbeat-feed-model.ts';
import { OutcomeBubble } from './heartbeat-outcome-bubble.tsx';

/**
 * A post's thoughts: one bubble each, stacked with small gaps like consecutive
 * chat messages from one author, then a quiet footer of where it went, what it
 * changed, and the link to its run in the Log.
 */
export function HeartbeatThoughts({
    logSearch,
    post,
    serverId,
}: {
    logSearch: string;
    post: FeedPost;
    serverId: string;
}) {
    const isDream = post.postKind === 'dreamed';
    const { thoughts } = post;
    return (
        <div className="grid min-w-0 gap-2 text-sm" data-heartbeat-post-kind={post.postKind}>
            <div className="mt-2 grid justify-items-start gap-1.5 pl-5">
                {thoughts.map((thought, index) => (
                    <OutcomeBubble
                        // biome-ignore lint/suspicious/noArrayIndexKey: thoughts can repeat; the stack never reorders
                        key={`${index}:${thought}`}
                        shape={isDream ? 'thought' : 'speech'}
                        tone={isDream ? 'dream' : 'report'}
                    >
                        <p>{thought}</p>
                    </OutcomeBubble>
                ))}
            </div>
            <footer className="flex flex-wrap gap-x-3.5 gap-y-1 text-muted text-xs tabular-nums">
                {isDream ? (
                    <DreamFooter post={post} />
                ) : (
                    <ReportFooter post={post} serverId={serverId} />
                )}
                {isDream && post.mark.runId ? (
                    <HeartbeatDreamLink
                        agentId={post.agentId}
                        runId={post.mark.runId}
                        serverId={serverId}
                    />
                ) : (
                    <Link className="text-accent hover:underline" to={logSearch}>
                        View run
                    </Link>
                )}
            </footer>
        </div>
    );
}

function ReportFooter({ post, serverId }: { post: FeedPost; serverId: string }) {
    const chatId = post.mark.report?.postedChatId ?? null;
    const chat = useListedChat(serverId, chatId ?? '', chatId !== null);
    return <span>{chatId ? `Posted in ${readPlace(chat)}` : 'Read, nothing posted'}</span>;
}

function DreamFooter({ post }: { post: FeedPost }) {
    const { dream } = post.mark;
    if (!dream) {
        return null;
    }
    const followUps = readFollowUpCount(dream.followUps);
    return (
        <>
            {dream.added + dream.removed > 0 ? (
                <span>{`Memory +${dream.added} −${dream.removed}`}</span>
            ) : null}
            {dream.followUpTitles.length > 0
                ? dream.followUpTitles.map((title, index) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: titles can repeat; the list never reorders
                      <span className="text-foreground" key={`${index}:${title}`}>
                          {`Follow-up: ${title}`}
                      </span>
                  ))
                : followUps && <span>{followUps}</span>}
        </>
    );
}

/** DMs read "DM", never the peer's name; a channel reads "#name". */
function readPlace(chat: Chat | undefined): string {
    if (!chat) {
        return 'a chat';
    }
    if (chat.kind === 'dm') {
        return 'a DM';
    }
    return chat.name ? `#${chat.name}` : 'a channel';
}

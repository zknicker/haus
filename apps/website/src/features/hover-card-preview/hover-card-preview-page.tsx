import type { MessageCause } from '@haus/api';
import type { ReactNode } from 'react';
import { hausHoverCardClassName } from '../../components/ui/cursor-hover-card.tsx';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { MessageCauseHoverContent } from '../chats/automation/message-cause-mark.tsx';
import { SessionMarkHoverContent } from '../chats/session/message-session-mark.tsx';
import { AgentHoverCardContent } from '../members/agent-hover-card.tsx';
import { AmazonProductPreview, AmazonReference } from '../mentions/amazon-reference.tsx';
import { ChannelHoverCardContent } from '../mentions/channel-hover-card.tsx';
import { ReferenceHoverCardContent } from '../mentions/reference-hover-card.tsx';
import { SkillHoverCardContent } from '../mentions/skill-hover-card.tsx';
import { useServerContext } from '../servers/server-context.ts';
import { RuntimeIssueHelpContent } from '../usage/runtime-issue.tsx';
import './hover-card-preview.css';

/** Width classes mirror each card's call site; the material is the shared one. */
const compact = 'w-fit max-w-72';

/** Dev-only board: actual content and surface classes, held open for comparison. */
export function HoverCardPreviewPage() {
    const { server } = useServerContext();
    const agents = useAgents(server.id);
    const agent = agents.data?.find((value) => value.displayName === 'Blippy') ?? agents.data?.[0];
    const agentId = agent?.id ?? '';
    const now = new Date().toISOString();
    const cause = (kind: 'trigger' | 'reminder'): MessageCause => ({
        attribution: 'explicit',
        automationId: 'preview',
        fireId: 'preview',
        firedAt: now,
        kind,
        ownerAgentId: agentId,
        title: kind === 'trigger' ? 'Deploy finished' : 'Weekly self-review',
        summary: kind === 'trigger' ? 'Webhook' : 'Every Monday at 09:00',
        live: {
            fireCount: 6,
            instruction: 'Summarize the results and flag anything that needs attention.',
            lastFiredAt: now,
            status: kind === 'trigger' ? 'armed' : 'scheduled',
        },
    });
    return (
        <main className="hover-card-preview-backdrop h-full overflow-auto p-8">
            <header className="mb-8 flex flex-col gap-2">
                <h1 className="font-semibold text-2xl">Hover cards</h1>
                <p className="text-sm">
                    Hover to try it:{' '}
                    <AmazonReference
                        product={{ asin: 'B07XN9T11R', marketplaceId: 'ATVPDKIKX0DER' }}
                        serverId={server.id}
                    >
                        B07XN9T11R
                    </AmazonReference>
                </p>
                <p className="max-w-3xl text-muted">
                    Every panel is held open with the app’s real content component and the shared
                    always-dark glass material. Widths match each card’s call site.
                </p>
                <p className="text-muted text-sm">
                    Agent uses live dev data. Other panels use representative fixtures. Human, file,
                    website, app, and pull-request references have no rich hover card.
                </p>
            </header>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] items-start gap-x-8 gap-y-12">
                <Sample detail="320px" title="Agent" width="w-80">
                    {agent ? (
                        <AgentHoverCardContent
                            agentId={agent.id}
                            agentName={agent.displayName}
                            serverId={server.id}
                        />
                    ) : (
                        <p>Loading dev Agent…</p>
                    )}
                </Sample>
                <Sample detail="Up to 288px" title="Channel" width={compact}>
                    <ChannelHoverCardContent
                        activityLabel="Active 4m ago"
                        appearance={{
                            icon: 'chat',
                            channelAppearance: { color: null, icon: null },
                        }}
                        displayLabel="product"
                        participants={[
                            { id: 'human', name: 'Zach', avatarUrl: null },
                            ...(agents.data ?? []).slice(0, 3).map((value) => ({
                                id: value.id,
                                name: value.displayName,
                                avatarUrl: value.avatarUrl,
                            })),
                        ]}
                    />
                </Sample>
                <Sample detail="Up to 288px" title="Skill" width={compact}>
                    <SkillHoverCardContent
                        appearance={{ icon: 'skill' }}
                        description="Build thoughtful, polished interfaces with strong typography and clear visual hierarchy."
                        displayLabel="Frontend Design"
                    />
                </Sample>
                <Sample
                    detail="Floating cutout · 384px total"
                    title="Amazon product"
                    width="haus-product-hover w-96 max-w-[calc(100vw-2rem)]"
                >
                    <AmazonProductPreview
                        product={{
                            asin: 'B07XN9T11R',
                            marketplaceId: 'ATVPDKIKX0DER',
                            title: 'Freaky Lunch Lady Halloween Teacher Costume Cafeteria T-Shirt',
                            brand: 'Halloween by 14th Floor',
                            shortName: 'Freaky Lunch Lady',
                            amazonListingStatus: 'active',
                            thumbnail: { status: 'unavailable' },
                            cutoutThumbnail: {
                                status: 'available',
                                url: 'https://images.rankwrangler.merchbase.co/cutouts/ATVPDKIKX0DER/B07XN9T11R/d94a16a3eb8bf15f066df50ee8e5ac3f.webp',
                            },
                            price: { amountMinor: 1895, currencyCode: 'USD' },
                        }}
                    />
                </Sample>
                <Sample detail="Up to 288px" title="Trigger" width={compact}>
                    <MessageCauseHoverContent cause={cause('trigger')} />
                </Sample>
                <Sample detail="Up to 288px" title="Reminder" width={compact}>
                    <MessageCauseHoverContent cause={cause('reminder')} />
                </Sample>
                <Sample detail="Up to 288px" title="New session" width={compact}>
                    <SessionMarkHoverContent
                        rotation={{
                            generation: 5,
                            previousDurationMs: 10_800_000,
                            reason: 'configuration',
                            rotatedAt: now,
                        }}
                    />
                </Sample>
                <Sample detail="288px · anchored" title="Runtime · authentication" width="w-72">
                    <RuntimeIssueHelpContent
                        computerName="Mac Mini"
                        issue="authentication"
                        runtimeId="claude-code"
                        title="Claude Code"
                    />
                </Sample>
                <Sample detail="288px · anchored" title="Runtime · usage" width="w-72">
                    <RuntimeIssueHelpContent
                        computerName="Mac Mini"
                        issue="usage"
                        runtimeId="codex"
                        title="Codex"
                    />
                </Sample>
                {(['agent', 'chat', 'skill'] as const).map((kind) => (
                    <Sample
                        detail="Up to 288px · missing live context"
                        key={kind}
                        title={`Reference fallback · ${kind}`}
                        width={compact}
                    >
                        <ReferenceHoverCardContent
                            appearance={{ icon: kind }}
                            displayLabel={
                                kind === 'agent'
                                    ? 'Blippy'
                                    : kind === 'chat'
                                      ? 'product'
                                      : 'Frontend Design'
                            }
                            kind={kind}
                            metadata={{
                                description: 'Reference description supplied with the message.',
                            }}
                        />
                    </Sample>
                ))}
            </div>
        </main>
    );
}

function Sample({
    title,
    detail,
    width,
    children,
}: {
    title: string;
    detail: string;
    width: string;
    children: ReactNode;
}) {
    return (
        <section className="flex min-w-0 flex-col items-start gap-3">
            <header>
                <h2 className="font-semibold text-sm">{title}</h2>
                <p className="text-muted text-xs">{detail}</p>
            </header>
            <div className={`hover-card__content ${hausHoverCardClassName} ${width}`}>
                {children}
            </div>
        </section>
    );
}

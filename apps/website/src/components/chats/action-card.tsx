import * as React from 'react';
import { cn } from '../../lib/utils.ts';

/**
 * The transcript card for a piece of work that arrived in the chat — Cloud
 * Agent work today, a pull request next. It is an object that arrived in the
 * chat, so it reads like the other objects that do: the attachment row and
 * the artifact card. Bordered `nested-surface` (the chat card background),
 * full width up to the shared in-chat column (`--chat-card-width`), a header of mark plus
 * title/description content — the title carries a status chip at the right
 * end of the title line, when the kind has one — one or more muted meta rows,
 * and a bottom row of controls.
 *
 * The shell is composed, not configured: every kind writes its own card out of
 * the named parts, in whatever order it needs, and omits the parts it has no
 * content for. A part with nothing to say is left out rather than rendered
 * empty, so the card never spends a row on absence.
 *
 * The meta rows carry the kind, so the card never spends a row announcing what
 * it is. Everything else — the committed values, the runtime, the guidance —
 * belongs to the surface the action opens. The card itself is inert; the
 * controls in `ActionCard.Actions` are real, and they are the only click
 * targets.
 *
 * A pull request would compose the same parts without touching this file:
 *
 * ```tsx
 * <ActionCard actionKind="pull-request" actionStatus="open" aria-label="Pull request #482">
 *   <ActionCard.Header>
 *     <ActionCard.Mark>
 *       <EntityAvatar name="Orbit" size={48} src={avatarUrl} />
 *     </ActionCard.Mark>
 *     <ActionCard.Content>
 *       <ActionCard.Title>
 *         Restore avatar image generation
 *         <ActionCard.Status>
 *           <Chip color="success" size="sm" variant="soft">
 *             <Chip.Label>Open</Chip.Label>
 *           </Chip>
 *         </ActionCard.Status>
 *       </ActionCard.Title>
 *       <ActionCard.Description>zknicker/haus · codex/avatar-fix</ActionCard.Description>
 *     </ActionCard.Content>
 *   </ActionCard.Header>
 *   <ActionCard.Meta>14 files changed · +762 −1</ActionCard.Meta>
 *   <ActionCard.Actions>
 *     <Button size="sm" variant="primary">View PR</Button>
 *     <Button size="sm" variant="secondary">Open</Button>
 *   </ActionCard.Actions>
 * </ActionCard>
 * ```
 */
function ActionCardRoot({
    actionKind,
    actionStatus,
    className,
    ...props
}: React.ComponentProps<'article'> & {
    /** Verbatim `data-action-kind`, so tests and e2e selectors stay stable. */
    actionKind: string;
    /** Verbatim `data-action-status` from the Server record, not a tone. */
    actionStatus: string;
}) {
    return (
        <article
            className={cn(
                // Fills the shared in-chat column (`--chat-card-width`), so it
                // lines up with the thread preview stacked beneath it.
                'card-shell mt-1.5 flex w-full max-w-(--chat-card-width) flex-col gap-2 border border-separator bg-nested-surface p-3',
                className
            )}
            data-action-kind={actionKind}
            data-action-status={actionStatus}
            data-slot="action-card"
            {...props}
        />
    );
}

/**
 * The card's top row: mark, then content. Top-aligned because the mark is
 * taller than the two text lines beside it, so a two-line `Content` doesn't
 * drag the mark down to its own midpoint.
 */
function ActionCardHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div className={cn('flex items-start gap-3', className)} data-slot="header" {...props} />
    );
}

/** The identity box: an `EntityAvatar`, or a glyph in the same 48px box. */
function ActionCardMark({ className, ...props }: React.ComponentProps<'div'>) {
    return <div className={cn('shrink-0', className)} data-slot="mark" {...props} />;
}

/**
 * The two-line stack beside the mark: a `Title` over a `Description`,
 * mirroring HeroUI's `ItemCard` Icon / Content / Action anatomy.
 */
function ActionCardContent({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            className={cn('flex min-w-0 flex-1 flex-col', className)}
            data-slot="content"
            {...props}
        />
    );
}

/**
 * What the action is about, in one row that truncates rather than wraps. A
 * status chip is a fact about the object, so it goes inside `Title` right
 * after the name, wrapped in `ActionCard.Status`
 * (`<ActionCard.Title>{name}<ActionCard.Status><Chip>…</Chip></ActionCard.Status></ActionCard.Title>`),
 * which lands it at the right end of the title row, centered on the title
 * text since `Title` is `items-center` — never pinned to the header's top
 * corner. Bare string/number children get wrapped so they truncate
 * individually; a `Chip` or other element renders as-is and owns its own
 * `shrink-0`.
 */
function ActionCardTitle({ children, className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            className={cn(
                'flex min-w-0 items-center gap-2 font-medium text-foreground text-sm leading-5',
                className
            )}
            data-slot="title"
            {...props}
        >
            {React.Children.map(children, (child) =>
                typeof child === 'string' || typeof child === 'number' ? (
                    <span className="min-w-0 truncate">{child}</span>
                ) : (
                    child
                )
            )}
        </div>
    );
}

/**
 * Wraps a status chip inside `Title`, right after the name, and pushes it to
 * the far right of the title row with `ml-auto`. `Title`'s `items-center`
 * then centers it on the title text, and the card's own padding becomes its
 * distance from the right edge — no separate corner-pinned slot.
 */
function ActionCardStatus({ className, ...props }: React.ComponentProps<'span'>) {
    return <span className={cn('ml-auto shrink-0', className)} data-slot="status" {...props} />;
}

/** The line under `Title`, inside `Content`: one truncated line of context. */
function ActionCardDescription({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            className={cn('min-w-0 truncate text-muted text-xs leading-5', className)}
            data-slot="description"
            {...props}
        />
    );
}

/**
 * One muted detail row. Repeat it per fact; an optional leading icon sits at
 * 14px. The row is a block rather than a flex line so an over-long detail ends
 * in an ellipsis: `text-overflow` never reaches the anonymous flex item a bare
 * string becomes, so a flex row clips mid-word instead. That makes the icon an
 * inline run, which is what it is here anyway.
 */
function ActionCardMeta({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            className={cn(
                'block min-w-0 truncate text-muted text-xs leading-5 [&>svg]:me-1.5 [&>svg]:inline [&>svg]:size-3.5 [&>svg]:align-middle',
                className
            )}
            data-slot="meta"
            {...props}
        />
    );
}

/**
 * The bottom row of real controls — HeroUI `Button`s at `size="sm"`. `mt-2`
 * doubles the root's `gap-2` rhythm so the button row reads as its own band
 * below the content instead of a fourth text line.
 */
function ActionCardActions({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            className={cn('mt-2 flex flex-wrap items-center gap-2', className)}
            data-slot="actions"
            {...props}
        />
    );
}

export const ActionCard = Object.assign(ActionCardRoot, {
    Actions: ActionCardActions,
    Content: ActionCardContent,
    Description: ActionCardDescription,
    Header: ActionCardHeader,
    Mark: ActionCardMark,
    Meta: ActionCardMeta,
    Status: ActionCardStatus,
    Title: ActionCardTitle,
});

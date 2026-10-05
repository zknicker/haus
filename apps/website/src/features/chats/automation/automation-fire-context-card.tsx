import type { AutomationFireContext } from '@haus/api';
import { Button, Chip, Disclosure } from '@heroui/react';
import { CodeBlock } from '@heroui-pro/react/code-block';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { useFireContext } from '../../../hooks/chats/use-fire-context.ts';
import { AutomationGlyphBox } from './automation-glyph.tsx';
import { ManageInAutomationsLink } from './automation-manage-link.tsx';
import {
    type AutomationMetaPart,
    automationStatusChip,
    fireContextAnchorNote,
    fireContextMetaParts,
    fireContextPayloadLabel,
    fireContextPayloadLanguage,
    messageCauseArchivedNote,
    messageCauseDescription,
} from './automation-presentation.ts';

/**
 * The head of a caused message's Thread: what fired, when, and with what.
 *
 * The transcript mark says only which automation spoke; this card adds a
 * Reminder's description under its title. Everything the fire
 * actually carried — its position in that automation's history, the body an
 * outside system POSTed, the note a Reminder was set from — lives here,
 * because a Thread is where someone goes to ask why.
 *
 * Nothing renders until the read resolves. A card that flashed an empty shell
 * above the anchor would move the message the reader came for.
 *
 * Once the automation is archived every live-side fact — its status, its place
 * in the history, the payload, the anchoring note — is gone with the record,
 * and the card states the fire the message snapshotted plus one line saying so.
 */
export function AutomationFireContextCard({
    messageId,
    serverId,
}: {
    messageId: string;
    serverId: string;
}) {
    const context = useFireContext(serverId, messageId, true);

    if (!context.data) {
        return null;
    }

    return <AutomationFireContextCardView context={context.data} />;
}

/** The resolved card. Split from the read so its shape can be proved directly. */
export function AutomationFireContextCardView({ context }: { context: AutomationFireContext }) {
    const now = useRelativeNow();
    const cause = context.cause;
    const live = cause.live;
    const status = live ? automationStatusChip(live.status) : null;
    const payloadLabel = fireContextPayloadLabel(context);
    const anchorNote = fireContextAnchorNote(context);
    const archivedNote = messageCauseArchivedNote(cause);
    const description = messageCauseDescription(cause);

    return (
        <section
            aria-label={`${cause.title} fire context`}
            className="card-shell mb-2 flex flex-col bg-nested-surface shadow-(--nested-surface-ring)"
        >
            <div className="flex flex-col gap-1.5 p-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                    <AutomationGlyphBox kind={cause.kind} />
                    <span className="min-w-0 flex-1 truncate font-semibold text-foreground text-sm">
                        {cause.title}
                    </span>
                    {status ? (
                        <Chip color={status.color} size="sm" variant="soft">
                            {status.label}
                        </Chip>
                    ) : null}
                </div>
                {description ? (
                    <p className={`m-0 text-foreground text-sm leading-snug ${factIndent}`}>
                        {description}
                    </p>
                ) : null}
                <p
                    className={`m-0 flex flex-wrap gap-1.5 text-muted text-xs leading-4 ${factIndent}`}
                >
                    {fireContextMetaParts(context, now).map((part, index) => (
                        <MetaPart
                            index={index}
                            key={part.value + (part.prefix ?? '')}
                            part={part}
                        />
                    ))}
                </p>
                {archivedNote ? (
                    <p className={`m-0 text-muted text-xs leading-4 ${factIndent}`}>
                        {archivedNote}
                    </p>
                ) : null}
            </div>
            {/* An archived automation has nothing below the line: no payload,
                no anchoring note, and no page left to open. */}
            {live ? (
                <div className="flex flex-col gap-2 border-separator border-t px-2.5 py-2">
                    {payloadLabel && context.payload ? (
                        <PayloadDisclosure
                            code={context.payload}
                            contentType={context.contentType}
                            label={payloadLabel}
                            truncated={context.payloadTruncated}
                        />
                    ) : null}
                    {anchorNote ? (
                        <p className="m-0 text-muted text-xs leading-snug">{anchorNote}</p>
                    ) : null}
                    <ManageInAutomationsLink agentId={cause.ownerAgentId} />
                </div>
            ) : null}
        </section>
    );
}

/** Hangs a fact line under the title, past the glyph box and the gap after it. */
const factIndent = 'pl-[calc(24px+var(--spacing)*2.5)]';

function MetaPart({ index, part }: { index: number; part: AutomationMetaPart }) {
    return (
        <span className="flex items-center gap-1.5">
            {index > 0 ? <span aria-hidden="true">·</span> : null}
            {part.prefix ? <span>{part.prefix}</span> : null}
            <b className="font-medium text-foreground">{part.value}</b>
            {part.suffix ? <span>{part.suffix}</span> : null}
        </span>
    );
}

function PayloadDisclosure({
    code,
    contentType,
    label,
    truncated,
}: {
    code: string;
    contentType: string | null;
    label: string;
    truncated: boolean;
}) {
    return (
        <Disclosure>
            <Disclosure.Heading>
                {/* Stock ghost trigger: the payload is an aside in this card,
                    and the quietest thing HeroUI already ships is exactly it. */}
                <Button size="sm" slot="trigger" variant="ghost">
                    <Disclosure.Indicator />
                    {label}
                </Button>
            </Disclosure.Heading>
            <Disclosure.Content>
                <Disclosure.Body className="pt-2">
                    {/*
                     * A step up the surface ladder, because this block is
                     * nested inside a nested surface: stock CodeBlock paints
                     * `--surface-secondary`, which is exactly the card it sits
                     * in, so the excerpt would have no edge at all.
                     */}
                    <CodeBlock className="min-w-0 bg-surface-tertiary">
                        <CodeBlock.Code
                            className="max-h-56 overflow-auto"
                            code={code}
                            language={fireContextPayloadLanguage(contentType)}
                        />
                    </CodeBlock>
                    {truncated ? (
                        <p className="m-0 pt-1 text-muted text-xs">
                            Excerpt — the full body is on the Automations tab.
                        </p>
                    ) : null}
                </Disclosure.Body>
            </Disclosure.Content>
        </Disclosure>
    );
}

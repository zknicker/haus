import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import type { LinearIssueHoverModel } from './linear-issue-model.ts';
import { ReferencePreviewHeader, ReferencePreviewText } from './reference-preview-header.tsx';

/**
 * The issue card: its key and workflow state as the identity row, the title,
 * then who holds it and the latest Agent change. Colors are Linear's own data
 * (state and labels), so they ride inline styles rather than theme tokens.
 */
export function LinearIssuePreview({ model }: { model: LinearIssueHoverModel }) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <ReferencePreviewHeader
                mark={<StateDot color={model.state.color} />}
                meta={model.state.name}
                title={model.identifier}
            >
                <ReferencePreviewText className="line-clamp-3" tone="foreground">
                    {model.title}
                </ReferencePreviewText>
                {model.delegate || model.assignee ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-muted text-xs">
                        {model.delegate ? (
                            <span className="flex min-w-0 items-center gap-1.5">
                                <EntityAvatar
                                    name={model.delegate.displayName}
                                    size={16}
                                    src={model.delegate.avatarUrl}
                                />
                                <span className="truncate">{model.delegate.displayName}</span>
                            </span>
                        ) : null}
                        {model.assignee ? (
                            <span className="truncate">Assignee {model.assignee}</span>
                        ) : null}
                    </div>
                ) : null}
                {model.labels.length > 0 ? (
                    <div className="flex min-w-0 flex-wrap gap-x-2.5 gap-y-1 text-muted text-xs">
                        {model.labels.map((label) => (
                            <span className="flex items-center gap-1" key={label.id}>
                                <StateDot color={label.color} size="small" />
                                {label.name}
                            </span>
                        ))}
                    </div>
                ) : null}
                {model.lastChange ? (
                    <span className="truncate text-muted text-xs">{model.lastChange}</span>
                ) : null}
            </ReferencePreviewHeader>
            {model.thumbnailUrl ? (
                <img
                    alt=""
                    className="size-18 rounded-md object-cover"
                    height={72}
                    src={model.thumbnailUrl}
                    width={72}
                />
            ) : null}
        </div>
    );
}

function StateDot({ color, size = 'mark' }: { color: string; size?: 'mark' | 'small' }) {
    return (
        <span
            aria-hidden="true"
            className={size === 'mark' ? 'size-2.5 shrink-0 rounded-full' : 'size-2 rounded-full'}
            style={{ backgroundColor: color }}
        />
    );
}

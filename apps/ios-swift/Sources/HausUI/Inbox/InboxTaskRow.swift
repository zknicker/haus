import HausModels
import SwiftUI

/// One assigned Task in the Unread feed. Where a conversation row is two lines
/// that open somewhere, this one carries the work: what it is, the message it
/// came from, a reply, and the resolutions that finish it here.
///
/// Every control is its own hit target, because a List row's own tap would
/// swallow them; the title is the way into the Task.
struct InboxTaskRow: View {
    let item: InboxTaskItem
    let now: Date
    let onOpen: () -> Void
    let onMove: (BoardColumn) -> Void
    let onMarkRead: () -> Void
    let onReply: (String) async -> Bool

    @State private var reply = ""
    @State private var isSending = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ScaledMetric(relativeTo: .subheadline) private var actionLineHeight: CGFloat = 20

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            source
            title
            if let context = item.context {
                contextCard(context)
                if context.acceptsReplies { composer(context) }
            }
            actions
        }
        .padding(.horizontal, InboxMetrics.rowInset)
        .padding(.vertical, InboxMetrics.rowVerticalPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        // The separator spans the card, instead of the List guessing from the
        // last text it finds, which is the status menu's.
        .alignmentGuide(.listRowSeparatorLeading) { _ in InboxMetrics.rowInset }
    }

    /// `Security · SEC-27 · Zero assigned you`, and how long ago.
    private var source: some View {
        HStack(spacing: 6) {
            AvatarView(name: item.assignerName, url: item.assignerAvatarURL, size: 18)
            Text("\(item.boardName) · \(item.key) · \(item.assignerName) assigned you")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(HausCompactRelativeTime.label(for: item.assignedAt, now: now))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .fixedSize()
        }
    }

    private var title: some View {
        Button(action: onOpen) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                TaskPriorityIcon(priority: item.priority, size: 14, surface: HausPlatformColor.groupedSurface)
                    .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 2 }
                VStack(alignment: .leading, spacing: 2) {
                    // `Color.primary`, because the `.primary` style inherits a
                    // borderless Button's tint, and a Button centers its wrap.
                    Text(item.title)
                        .font(.headline)
                        .foregroundStyle(Color.primary)
                        .multilineTextAlignment(.leading)
                        .lineLimit(3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if let dueLabel {
                        Text(dueLabel)
                            .font(.footnote)
                            .foregroundStyle(isOverdue ? Color.red : Color.secondary)
                    }
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(item.title)
        .accessibilityValue(accessibilityValue)
        .accessibilityHint("Opens the task")
    }

    /// The message the item stands on, quoted in the row's own recess.
    private func contextCard(_ context: InboxTaskContext) -> some View {
        HStack(alignment: .top, spacing: 8) {
            AvatarView(name: context.authorName, url: context.authorAvatarURL, size: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(context.authorName) in \(context.place) · \(age(context))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text(RichMessageParser.oneLinePreview(context.content))
                    .font(.subheadline)
                    .lineLimit(4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(10)
        .background(
            HausPlatformColor.inputSurface,
            in: RoundedRectangle(cornerRadius: InboxMetrics.boxRadius, style: .continuous)
        )
        .accessibilityElement(children: .combine)
    }

    /// A reply lands in a Thread on the context message, so discussion stays
    /// where the Task already lives and shows in its Mentioned in.
    private func composer(_ context: InboxTaskContext) -> some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField("Reply to \(context.authorName) in thread…", text: $reply, axis: .vertical)
                .lineLimit(1...4)
                .font(.subheadline)
                .disabled(isSending)
            if !trimmedReply.isEmpty {
                Button { Task { await send() } } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title3)
                }
                .buttonStyle(.borderless)
                .disabled(isSending)
                .accessibilityLabel("Send reply")
            }
        }
    }

    /// One line when the words fit. A long column name drops the menus to a
    /// line of their own, and at accessibility sizes every button stacks, so a
    /// button never truncates its own words.
    private var actions: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 0) {
                HStack(spacing: 8) { resolutionButtons }
                Spacer(minLength: 8)
                menus
            }
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) { resolutionButtons }
                menus
            }
            VStack(alignment: .leading, spacing: 8) {
                resolutionButtons
                menus
            }
        }
        .controlSize(.small)
        .buttonStyle(.bordered)
    }

    private var resolutionButtons: some View {
        ForEach(item.resolutions, id: \.resolution) { resolution, column in
            Button(resolution.title) { onMove(column) }
        }
    }

    private var menus: some View {
        HStack(spacing: 8) {
            statusMenu
            moreMenu
        }
    }

    /// The status picker reaches any column, not just the three one-tap ones.
    private var statusMenu: some View {
        Menu {
            ForEach(item.columns) { column in
                Button { onMove(column) } label: {
                    Label(
                        column.name,
                        systemImage: column.id == item.columnID ? "checkmark" : column.category.symbolName
                    )
                }
                .disabled(column.id == item.columnID)
            }
        } label: {
            // Not a `Label`: a bordered Menu measures one short and truncates
            // its title to an ellipsis, so the row of buttons "fits" without
            // the column name. Fixed, a long name stacks the row instead.
            HStack(spacing: 4) {
                Image(systemName: item.category.symbolName)
                Text(item.columnName)
            }
            .lineLimit(1)
            .fixedSize()
        }
        .disabled(item.columns.isEmpty)
    }

    private var moreMenu: some View {
        Menu {
            Button(action: onOpen) {
                Label("Open Task", systemImage: "arrow.up.right")
            }
            Button(action: onMarkRead) {
                Label("Mark Read", systemImage: "envelope.open")
            }
        } label: {
            // A bare glyph is shorter than a text button's line, which drew
            // this capsule at half the height of the buttons beside it.
            Image(systemName: "ellipsis")
                .frame(minHeight: actionLineHeight)
                .accessibilityLabel("More")
        }
    }

    private var trimmedReply: String {
        reply.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var dueLabel: String? {
        item.dueOn.flatMap { TaskDueDate.label($0, now: now) }.map { "Due \($0)" }
    }

    private var isOverdue: Bool {
        item.dueOn.map { TaskDueDate.isOverdue($0, now: now) } ?? false
    }

    private var accessibilityValue: String {
        var parts = [item.columnName]
        if item.priority != .none { parts.append("\(item.priority.displayName) priority") }
        if let dueLabel { parts.append(dueLabel) }
        return parts.joined(separator: ", ")
    }

    private func age(_ context: InboxTaskContext) -> String {
        HausCompactRelativeTime.label(for: context.createdAt, now: now)
    }

    private func send() async {
        let content = trimmedReply
        guard !content.isEmpty, !isSending else { return }
        isSending = true
        defer { isSending = false }
        if await onReply(content) { reply = "" }
    }
}

#if DEBUG
extension InboxTaskItem {
    static var preview: InboxTaskItem {
        InboxTaskItem(
            id: "task_27",
            key: "SEC-27",
            title: "Review which Agents can read the 1Password vault",
            boardName: "Security",
            assignerName: "Zero",
            assignerAvatarURL: nil,
            assignedAt: .now.addingTimeInterval(-7_200),
            priority: .high,
            dueOn: "2026-11-04",
            columnID: "col_todo",
            category: .todo,
            columns: TaskPreviewFixtures.boards[0].columns,
            context: InboxTaskContext(
                authorName: "Forge",
                authorAvatarURL: nil,
                place: "#security",
                createdAt: .now.addingTimeInterval(-3_600),
                content: "On SEC-27: I can read every item in the vault right now. Scope me down whenever you get to it."
            )
        )
    }
}

#Preview("Inbox task") {
    List {
        InboxTaskRow(
            item: .preview,
            now: .now,
            onOpen: {},
            onMove: { _ in },
            onMarkRead: {},
            onReply: { _ in true }
        )
        .inboxCardRow()
    }
}
#endif

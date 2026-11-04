import HausModels
import SwiftUI

/// Shared list geometry so rows and headers keep one left margin.
enum TaskListMetrics {
    static let horizontalInset: CGFloat = 20
    static let trailingSlotSize: CGFloat = 28
}

func defaultTaskChatLabel(_ item: ClaimListItem) -> String {
    switch item.chatKind {
    case .channel:
        "#\(item.chatName ?? "channel")"
    case .dm:
        "DM"
    }
}

/// The one place a claim's assignee becomes words.
///
/// The resolved presentation is authoritative, so the row label, the avatar,
/// and the Thread claim drawer always agree. The id-suffix forms only cover an
/// actor the App layer could not find in its directories.
enum TaskAssigneeLabel {
    static func text(for item: ClaimListItem, assignee: MessageAuthorPresentation?) -> String {
        if let assignee {
            return assignee.name
        }
        if let agentID = item.claim.assigneeAgentID {
            return "Agent \(String(agentID.suffix(6)))"
        }
        return "Unassigned"
    }
}

struct TaskSectionHeader: View {
    let title: String
    let count: Int
    let showsBoundaryRule: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if showsBoundaryRule {
                // Edge to edge: the row owns zero insets, so this rule spans
                // the screen instead of starting under the title.
                Divider()
                    .padding(.bottom, 14)
            }

            // Linear mobile keeps the group header to plain muted text; the
            // status disc earns its color in the rows, not twice on a screen.
            HStack(spacing: 7) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text("\(count)")
                    .font(.subheadline)
                    .monospacedDigit()
            }
            // The system's secondary label color, not a hierarchical
            // `.secondary`, which resolved against the header's own ink and
            // read too faint.
            .foregroundStyle(HausPlatformColor.secondaryLabel)
            .padding(.horizontal, TaskListMetrics.horizontalInset)
            .padding(.bottom, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .textCase(nil)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(count) tasks")
    }
}

struct TaskListRow: View {
    let item: ClaimListItem
    let chatLabel: String
    let assignee: MessageAuthorPresentation?
    let isMutating: Bool
    let onOpen: () -> Void
    let onUpdateStatus: (ClaimStatus) -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 9) {
                TaskPriorityIcon(priority: item.claim.priority)

                // No issue id on the row: Linear mobile leads with the two
                // glyphs and the title. The number stays in the a11y label.
                TaskStatusDisc(status: TaskStatusShape(item.claim.status))

                Text(title)
                    .font(.body)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.trailing, 4)

                if item.claim.tier == .background {
                    // A lens the reader opened, not a status of its own, so
                    // it reads as a muted word rather than a chip. It keeps
                    // its width: the title is the part that truncates.
                    Text("background")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                        .fixedSize()
                        .layoutPriority(1)
                }

                trailingSlot
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(.isButton)
        .contextMenu { actionMenu }
    }

    // One line, so the anchor collapses and a fence reads as the visual's name.
    private var title: String {
        RichMessageParser.oneLinePreview(item.message.content)
    }

    @ViewBuilder
    private var trailingSlot: some View {
        if isMutating {
            ProgressView()
                .controlSize(.small)
                .frame(
                    width: TaskListMetrics.trailingSlotSize,
                    height: TaskListMetrics.trailingSlotSize
                )
        } else if isAssigned {
            // AvatarView already falls back to initials when the actor has no
            // uploaded image, so the row never needs a second placeholder.
            AvatarView(
                name: assigneeLabel,
                url: assignee?.avatarURL,
                size: TaskListMetrics.trailingSlotSize
            )
        } else {
            // Keeps the trailing column aligned without claiming an actor.
            Circle()
                .strokeBorder(
                    Color.secondary.opacity(0.35),
                    style: StrokeStyle(lineWidth: 1, dash: [2.5, 2.5])
                )
                .frame(
                    width: TaskListMetrics.trailingSlotSize,
                    height: TaskListMetrics.trailingSlotSize
                )
        }
    }

    @ViewBuilder
    private var actionMenu: some View {
        Section("Status") {
            ForEach(ClaimStatus.ordered, id: \.self) { status in
                Button { onUpdateStatus(status) } label: {
                    if status == item.claim.status {
                        Label(status.displayName, systemImage: "checkmark")
                    } else {
                        Text(status.displayName)
                    }
                }
            }
        }
    }

    private var assigneeLabel: String {
        TaskAssigneeLabel.text(for: item, assignee: assignee)
    }

    private var isAssigned: Bool {
        item.claim.assigneeAgentID != nil
    }

    // The row sheds metadata visually, so the a11y label still carries it.
    private var accessibilityLabel: String {
        var parts = [
            "Claim #\(item.claim.number)",
            title,
            item.claim.status.displayName,
        ]
        if item.claim.priority != .none {
            parts.append("\(item.claim.priority.displayName) priority")
        }
        parts.append(assigneeLabel)
        parts.append(chatLabel)
        if item.claim.tier == .background {
            parts.append("background")
        }
        if isMutating {
            parts.append("Updating")
        }
        return parts.joined(separator: ", ")
    }
}

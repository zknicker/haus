import HausModels
import SwiftUI

/// One Task on a board: its key and priority, the title, and what else it
/// carries. The column it sits in is stated once, by the section it is under.
///
/// Move rides the long-press menu, the way a Mail message moves: a column is a
/// status, so it is a short list of names rather than a place to drag to.
struct TaskBoardRow: View {
    let task: BoardTask
    let labels: [TaskLabel]
    let assignee: MessageAuthorPresentation?
    let columns: [BoardColumn]
    let onOpen: () -> Void
    let onMove: (BoardColumn) -> Void

    @ScaledMetric(relativeTo: .body) private var avatarSize: CGFloat = 26

    var body: some View {
        Button(action: onOpen) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    facts
                    Text(task.title)
                        .font(.body)
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if !labels.isEmpty {
                        TaskLabelTags(labels: labels)
                    }
                }
                assigneeMark
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(.isButton)
        .contextMenu { moveMenu }
    }

    private var facts: some View {
        HStack(spacing: 6) {
            TaskPriorityIcon(priority: task.priority, size: 14)
            Text(task.key)
                .font(.footnote.weight(.medium))
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .lineLimit(1)
            if let dueLabel {
                Text(dueLabel)
                    .font(.footnote)
                    .foregroundStyle(isOverdue ? Color.red : Color.secondary)
                    .lineLimit(1)
            }
        }
    }

    @ViewBuilder
    private var assigneeMark: some View {
        if let assignee {
            AvatarView(name: assignee.name, url: assignee.avatarURL, size: avatarSize)
        } else {
            // Keeps the trailing column aligned without claiming an actor.
            Circle()
                .strokeBorder(
                    Color.secondary.opacity(0.35),
                    style: StrokeStyle(lineWidth: 1, dash: [2.5, 2.5])
                )
                .frame(width: avatarSize, height: avatarSize)
        }
    }

    @ViewBuilder
    private var moveMenu: some View {
        Section("Move to") {
            ForEach(columns) { column in
                Button { onMove(column) } label: {
                    Label(
                        column.name,
                        systemImage: column.id == task.columnID ? "checkmark" : column.category.symbolName
                    )
                }
                .disabled(column.id == task.columnID)
            }
        }
    }

    private var dueLabel: String? {
        task.dueOn.flatMap { TaskDueDate.label($0) }
    }

    /// Finished work is not late, whatever date it carries.
    private var isOverdue: Bool {
        guard let dueOn = task.dueOn, !task.category.isClosed else { return false }
        return TaskDueDate.isOverdue(dueOn)
    }

    private var accessibilityLabel: String {
        var parts = [task.key, task.title]
        if task.priority != .none { parts.append("\(task.priority.displayName) priority") }
        parts.append(assignee?.name ?? "Unassigned")
        if let dueLabel { parts.append(isOverdue ? "Overdue, \(dueLabel)" : "Due \(dueLabel)") }
        parts.append(contentsOf: labels.map(\.name))
        return parts.joined(separator: ", ")
    }
}

/// A column's section header: its disc, name, and count, and the one thing a
/// person does to a column from here, which is add to it. Finished columns
/// fold, so a board's history does not push its open work off the screen.
struct TaskColumnHeader: View {
    let column: BoardColumn
    let count: Int
    let isCollapsed: Bool
    /// Nil on a board that refuses new Tasks.
    let onAdd: (() -> Void)?
    let onToggle: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button(action: onToggle) {
                HStack(spacing: 8) {
                    TaskCategoryDisc(category: column.category, size: 16)
                    Text(column.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("\(count)")
                        .font(.subheadline)
                        .monospacedDigit()
                        .foregroundStyle(HausPlatformColor.secondaryLabel)
                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.tertiary)
                        .rotationEffect(.degrees(isCollapsed ? 0 : 90))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(column.name), \(count) tasks")
            .accessibilityValue(isCollapsed ? "Collapsed" : "Expanded")
            .accessibilityAddTraits(.isButton)

            Spacer(minLength: 8)

            if let onAdd {
                Button(action: onAdd) {
                    Image(systemName: "plus")
                        .font(.subheadline)
                        .foregroundStyle(HausPlatformColor.secondaryLabel)
                        .frame(minWidth: 32, minHeight: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Add task to \(column.name)")
            }
        }
        .textCase(nil)
    }
}

/// A Task's labels: a dot of the label's color and its name. No ground, so a
/// row with three of them still reads as one line of metadata.
struct TaskLabelTags: View {
    let labels: [TaskLabel]

    var body: some View {
        // Wraps on its own rather than truncating a name at large text sizes.
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { tags }
            VStack(alignment: .leading, spacing: 3) { tags }
        }
    }

    private var tags: some View {
        ForEach(labels) { label in
            HStack(spacing: 4) {
                Circle()
                    .fill(TaskLabelTint.color(label.color))
                    .frame(width: 7, height: 7)
                Text(label.name)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }
}

/// The Server's label color names as ink.
enum TaskLabelTint {
    static func color(_ name: String) -> Color {
        switch name {
        case "red": .red
        case "orange": .orange
        case "amber": .yellow
        case "green": .green
        case "teal": .teal
        case "blue": .blue
        case "purple": .purple
        case "pink": .pink
        default: .gray
        }
    }
}

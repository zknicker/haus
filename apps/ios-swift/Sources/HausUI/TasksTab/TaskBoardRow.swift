import HausModels
import SwiftUI

/// One Task in the tab's plain list: the state disc, the title, then the
/// assignee's mark and `HAUS-41 · product · 1h`, with the priority trailing.
struct TaskBoardRow: View {
    let task: TaskRecord
    let assignee: TaskPersonOption?
    let projectName: String?
    let isWaitingOnYou: Bool
    let now: Date

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            WorkListRow(title: task.title) {
                TaskStateDisc(
                    state: task.state,
                    size: 16,
                    surface: HausPlatformColor.canvas,
                    isWaitingOnYou: isWaitingOnYou
                )
            } meta: {
                if let assignee {
                    TaskAssigneeMark(person: assignee, side: 16)
                }
                WorkMetaLine(pieces: Self.metaPieces(task, projectName: projectName, now: now))
            }
            TaskPriorityIcon(priority: task.priority, surface: HausPlatformColor.canvas)
                .foregroundStyle(HausPlatformColor.mutedInk)
                .padding(.top, 12)
        }
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityValue(accessibilityValue)
    }

    nonisolated static func metaPieces(_ task: TaskRecord, projectName: String?, now: Date) -> [String] {
        [task.key, projectName, HausCompactRelativeTime.label(for: task.createdAt, now: now)].compactMap { $0 }
    }

    private var accessibilityValue: String {
        var parts = [isWaitingOnYou ? "Waiting on you" : TaskStateLabel.text(task.state)]
        if task.priority != .none { parts.append("\(task.priority.displayName) priority") }
        if let assignee { parts.append("Assigned to \(assignee.name)") }
        return parts.joined(separator: ", ")
    }
}

/// An assignee's mark: a Captain's squircle or a person's circle.
struct TaskAssigneeMark: View {
    let person: TaskPersonOption
    let side: CGFloat

    var body: some View {
        if person.isCaptain {
            CaptainMark(name: person.name, side: side) {
                AvatarView(name: person.name, url: person.avatarURL, size: side)
            }
        } else {
            AvatarView(name: person.name, url: person.avatarURL, size: side)
                .accessibilityLabel(person.name)
        }
    }
}

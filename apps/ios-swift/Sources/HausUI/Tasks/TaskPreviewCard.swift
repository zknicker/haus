import HausModels
import SwiftUI

/// One Task under the Message it started from (ADR 0052 decision 7), at
/// inline density: the state disc, key, and title, then what the
/// Task holds, then its newest messages. The whole row opens the Task.
///
/// Rows are hosted in `UIHostingConfiguration` cells with no environment of
/// their own, so the open goes through the App-installed
/// `InAppReferenceRoutes.openTask`, the same route a Task chip takes.
struct TaskPreviewCard: View {
    let task: TaskPreviewPresentation

    var body: some View {
        Button {
            InAppReferenceRoutes.openTask?(TaskReferenceTarget(taskID: task.taskID))
        } label: {
            VStack(alignment: .leading, spacing: 5) {
                header
                summary
                ForEach(task.recentMessages) { message in
                    TaskPreviewMessageRow(message: message)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressableRow(cornerRadius: HausRadius.medium))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(task.accessibilityLabel)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("task-preview-\(task.key)")
        .padding(.top, 6)
    }

    /// The title wraps rather than truncating: it is what the reader is
    /// deciding on, and a long one at a large text size must still read whole.
    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            TaskStateDisc(
                state: task.state,
                size: 16,
                surface: HausPlatformColor.background
            )
            .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 3 }
            (Text(task.key).foregroundStyle(.secondary).monospacedDigit()
                + Text("  ")
                + Text(task.title).fontWeight(.semibold))
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var summary: some View {
        HStack(spacing: 5) {
            Text(task.summaryLine)
                .fixedSize(horizontal: false, vertical: true)
            Image(systemName: "chevron.right").font(.caption2.weight(.semibold))
        }
        .font(.footnote.weight(.medium))
        .foregroundStyle(.tint)
    }
}

/// One quoted Task message: who said it, then the line, flattened the way
/// every quoting surface flattens Markdown.
private struct TaskPreviewMessageRow: View {
    let message: TaskMessagePreviewPresentation

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            AvatarView(name: message.author.name, url: message.author.avatarURL, presence: nil, size: 18)
                .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 4 }
            (Text(message.author.name).fontWeight(.medium)
                + Text(" " + RichMessageParser.oneLinePreview(message.content)))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Every Task the message started, one preview each, below its content.
struct TaskPreviewStack: View {
    let tasks: [TaskPreviewPresentation]

    var body: some View {
        ForEach(tasks) { task in
            TaskPreviewCard(task: task)
        }
    }
}

import HausModels
import SwiftUI

struct TaskPreviewCard: View {
    let task: TaskPreviewPresentation

    var body: some View {
        Button {
            InAppReferenceRoutes.openTaskCard?(TaskReferenceTarget(taskID: task.taskID))
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
        .accessibilityIdentifier("task-preview-\(task.shortID)")
        .padding(.top, 6)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            TaskActivityDisc(state: task.disc, size: 16, surface: HausPlatformColor.canvas)
                .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 3 }
            Text(task.title)
                .fontWeight(.semibold)
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

private struct TaskPreviewMessageRow: View {
    let message: TaskMessagePreviewPresentation

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            authorMark
                .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 4 }
            (Text(message.author.name).fontWeight(.medium)
                + Text(" " + RichMessageParser.oneLinePreview(message.content)))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var authorMark: some View {
        if message.author.kind == .captain {
            CaptainMark(name: message.author.name, side: 18) {
                AvatarView(name: message.author.name, url: message.author.avatarURL, size: 18 * 2.squareRoot())
            }
        } else {
            AvatarView(name: message.author.name, url: message.author.avatarURL, presence: nil, size: 18)
        }
    }
}

struct TaskPreviewStack: View {
    let tasks: [TaskPreviewPresentation]

    var body: some View {
        ForEach(tasks) { task in
            TaskPreviewCard(task: task)
        }
    }
}

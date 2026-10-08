import SwiftUI

/// The task work-surface metadata that follows its anchor message.
///
/// The anchor remains the canonical task title and the navigation bar names
/// the Task by number, so this view renders only the Server-owned task fields.
struct ThreadTaskMetadataView: View {
    let task: TaskPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            LabeledContent("Status") {
                TaskStatusLabel(status: task.status)
            }

            LabeledContent("Assignee") {
                TaskActorLabel(actor: task.assignee, emptyLabel: "Unassigned")
            }

            LabeledContent("Created by") {
                TaskActorLabel(actor: task.creator, emptyLabel: "Unknown")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(HausPlatformColor.inputSurface, in: .haus(HausRadius.large))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Task #\(task.number) details")
    }
}

private struct TaskStatusLabel: View {
    let status: TaskStatusPresentation

    var body: some View {
        HStack(spacing: 7) {
            TaskStatusDisc(
                status: TaskStatusShape(status),
                surface: HausPlatformColor.background
            )
            Text(status.rawValue)
        }
        .font(.subheadline.weight(.semibold))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(status.rawValue)
    }
}

private struct TaskActorLabel: View {
    let actor: MessageAuthorPresentation?
    let emptyLabel: String

    var body: some View {
        if let actor {
            HStack(spacing: 7) {
                AvatarView(
                    name: actor.name,
                    url: actor.avatarURL,
                    presence: actor.presence,
                    size: 22
                )
                Text(actor.name)
                    .font(.subheadline)
                    .lineLimit(1)
            }
            .accessibilityElement(children: .combine)
        } else {
            Text(emptyLabel)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}

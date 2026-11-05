import HausModels
import SwiftUI

/// **Mentioned in**: the messages that reference the Task, newest first. It is
/// the Task's activity, computed, never a second conversation.
struct TaskMentionsSection: View {
    let mentions: [TaskMention]
    let onOpen: (TaskMention) -> Void

    var body: some View {
        if !mentions.isEmpty {
            Section {
                ForEach(mentions) { mention in
                    Button { onOpen(mention) } label: {
                        HStack(alignment: .top, spacing: 10) {
                            AvatarView(name: mention.authorLabel, url: nil, size: 28)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(metaLine(mention))
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                Text(RichMessageParser.oneLinePreview(mention.excerpt))
                                    .font(.subheadline)
                                    .foregroundStyle(.primary)
                                    .lineLimit(3)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.pressableRow)
                }
            } header: {
                TaskSectionTitle(title: "Mentioned in", count: mentions.count)
            }
        }
    }

    private func metaLine(_ mention: TaskMention) -> String {
        let age = HausCompactRelativeTime.label(for: mention.createdAt, now: .now)
        return "\(mention.authorLabel) · \(mention.place.label) · \(age)"
    }
}

/// **Reminders**: the Reminders whose description names the Task. A Reminder
/// stays anchored on a message, and the Task only points at it (ADR 0051).
struct TaskRemindersSection: View {
    let reminders: [TaskReminderRef]
    let conversationLabel: @MainActor @Sendable (String) -> String
    let onOpen: (TaskReminderRef) -> Void

    var body: some View {
        if !reminders.isEmpty {
            Section {
                ForEach(reminders) { reminder in
                    Button { onOpen(reminder) } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "alarm")
                                .foregroundStyle(.secondary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(reminder.title)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(.primary)
                                Text(detailLine(reminder))
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.pressableRow)
                }
            } header: {
                TaskSectionTitle(title: "Reminders", count: reminders.count)
            }
        }
    }

    private func detailLine(_ reminder: TaskReminderRef) -> String {
        let kind = reminder.kind == .once ? "One-time" : "Recurring"
        let when = reminder.nextFireAt?.formatted(date: .abbreviated, time: .shortened) ?? "Finished"
        return "\(kind) · \(when) · \(conversationLabel(reminder.anchorChatID))"
    }
}

struct TaskSectionTitle: View {
    let title: String
    let count: Int

    var body: some View {
        HStack(spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.semibold))
            Text("\(count)")
                .font(.subheadline)
                .monospacedDigit()
        }
        .foregroundStyle(HausPlatformColor.secondaryLabel)
        .textCase(nil)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

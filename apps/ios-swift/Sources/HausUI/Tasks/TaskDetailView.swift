import HausModels
import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

/// A Task from before Tasks were places: one with no Chat of its own (ADR
/// 0052). It is read-only history, so the screen states what the Task is and
/// where it was talked about, with no composer and no control that writes.
/// A Task with a Chat never lands here; it opens as a chat (`TaskChatView`).
public struct TaskDetailView: View {
    private let taskID: String
    private let source: TaskDetailSource
    private let onOpenMention: (TaskMention) -> Void
    private let onOpenReminder: (TaskReminderRef) -> Void

    @State private var failure: String?

    public init(
        taskID: String,
        source: TaskDetailSource,
        onOpenMention: @escaping (TaskMention) -> Void,
        onOpenReminder: @escaping (TaskReminderRef) -> Void
    ) {
        self.taskID = taskID
        self.source = source
        self.onOpenMention = onOpenMention
        self.onOpenReminder = onOpenReminder
    }

    public var body: some View {
        content
            .navigationTitle(detail?.task.key ?? "")
            .hausInlineNavigationTitle()
            .toolbar { toolbar }
            .task { await load() }
            .refreshable { await load() }
    }

    private var detail: TaskDetail? {
        source.detail(taskID)
    }

    @ViewBuilder
    private var content: some View {
        if let detail {
            list(detail)
        } else if let failure {
            ContentUnavailableView {
                Label("Task unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(failure)
            } actions: {
                Button("Try again") { Task { await load() } }
                    .buttonStyle(.borderedProminent)
            }
        } else {
            // Blank until the read lands: a Task always has something to say,
            // so there is no empty state to confuse this with.
            Color.clear
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func list(_ detail: TaskDetail) -> some View {
        List {
            header(detail)
            facts(detail.task)
            TaskMentionsSection(
                mentions: detail.mentions,
                onOpen: onOpenMention
            )
            TaskRemindersSection(
                reminders: detail.reminders,
                conversationLabel: source.conversationLabel,
                onOpen: onOpenReminder
            )
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
    }

    /// The title and the description read as the Task's own words. The
    /// description draws like a message body, so its references are the same
    /// chips a Channel shows and open the same way.
    private func header(_ detail: TaskDetail) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                Text(detail.task.title)
                    .font(.title3.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if !detail.descriptionContent.isEmpty {
                    RichMessageContentView(
                        blocks: source.descriptionBlocks(detail),
                        textStyle: .subheadline
                    )
                }
            }
            .padding(.vertical, 4)
        } footer: {
            Text("This Task is from before Tasks had their own conversation, so it's read-only.")
        }
    }

    /// Native settings rows: a short title and a one-line value each. Two
    /// rows for the creator and the day, because one `Blippy · Nov 5, 2026`
    /// value wraps mid-date at accessibility sizes.
    private func facts(_ task: TaskRecord) -> some View {
        Section {
            LabeledContent("State") {
                HStack(spacing: 6) {
                    TaskStateDisc(state: task.state, size: 15)
                    Text(TaskStateLabel.text(task.state))
                }
            }
            if let assignee = task.assignee.flatMap(source.actor)?.name {
                LabeledContent("Assignee", value: assignee)
            }
            if task.priority != .none {
                LabeledContent("Priority", value: task.priority.displayName)
            }
            if let due = task.dueOn.flatMap({ TaskDueDate.label($0) }) {
                LabeledContent("Due", value: due)
            }
            if let labels = labelSummary(task) {
                LabeledContent("Labels", value: labels)
            }
            if let creator = task.createdBy.flatMap(source.actor)?.name {
                LabeledContent("Created by", value: creator)
            }
            LabeledContent("Created") {
                Text(task.createdAt, format: .dateTime.month(.abbreviated).day().year())
            }
            LabeledContent("Updated") {
                Text(task.updatedAt, format: .relative(presentation: .named))
            }
        }
    }

    /// One short value whatever the Task carries: a value that wraps or
    /// truncates in a settings row reads as broken.
    private func labelSummary(_ task: TaskRecord) -> String? {
        let names = source.labels().filter { task.labelIDs.contains($0.id) }.map(\.name)
        switch names.count {
        case 0: return nil
        case 1 where names[0].count <= 20: return names[0]
        case 1: return "1 label"
        default: return "\(names.count) labels"
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            Menu {
                Button { copyReference() } label: {
                    Label("Copy reference", systemImage: "doc.on.doc")
                }
            } label: {
                Label("Task options", systemImage: "ellipsis")
            }
        }
    }

    /// The key is the reference: pasted into any message, it becomes a chip.
    private func copyReference() {
        #if canImport(UIKit)
        UIPasteboard.general.string = detail?.task.key
        #endif
    }

    /// The Task opens with what the rest of the screen stands on. A failure
    /// after the Task has landed keeps the screen; the next read repairs it.
    private func load() async {
        do {
            async let detail: Void = source.loadDetail(taskID)
            async let labels: Void = source.loadLabels()
            _ = try await (detail, labels)
            failure = nil
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled, detail == nil else { return }
            failure = error.localizedDescription
        }
    }
}

#Preview("Read-only Task") {
    NavigationStack {
        TaskDetailView(
            taskID: "task_12",
            source: .preview,
            onOpenMention: { _ in },
            onOpenReminder: { _ in }
        )
    }
}

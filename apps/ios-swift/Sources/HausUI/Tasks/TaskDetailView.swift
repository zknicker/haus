import HausModels
import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

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
            .navigationTitle(detail?.task.shortID ?? "")
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

    private func facts(_ task: TaskRecord) -> some View {
        Section {
            LabeledContent("Status") {
                HStack(spacing: 6) {
                    TaskActivityDisc(state: TaskDiscState(task), size: 15)
                    Text(TaskDiscState(task).label)
                }
            }
            if let creator = source.actor(task.createdBy)?.name {
                LabeledContent("Started by", value: creator)
            }
            LabeledContent("Created") {
                Text(task.createdAt, format: .dateTime.month(.abbreviated).day().year())
            }
            LabeledContent("Updated") {
                Text(task.updatedAt, format: .relative(presentation: .named))
            }
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

    private func copyReference() {
        #if canImport(UIKit)
        UIPasteboard.general.string = detail.map { TaskReference.markdown($0.task) }
        #endif
    }

    /// The Task opens with what the rest of the screen stands on. A failure
    /// keeps a held detail on screen.
    private func load() async {
        do {
            try await source.loadDetail(taskID)
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

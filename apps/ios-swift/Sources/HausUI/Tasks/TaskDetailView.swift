import HausModels
import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

/// One Task: what it is, its properties, and where it is being talked about.
///
/// A Task has no comments. Discussion lives in Channels and Threads, and the
/// messages that reference it are its **Mentioned in**, so this screen only ever
/// leads out to them.
public struct TaskDetailView: View {
    private let taskID: String
    private let source: TaskBoardSource
    private let onOpenMention: (TaskMention) -> Void
    private let onOpenReminder: (TaskReminderRef) -> Void

    @State private var failure: String?
    @State private var errorMessage: String?
    @State private var showsEditor = false

    public init(
        taskID: String,
        source: TaskBoardSource,
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
            .sheet(isPresented: $showsEditor) {
                if let task = detail?.task {
                    TaskEditorSheet(task: task, source: source)
                }
            }
    }

    private var detail: BoardTaskDetail? {
        source.detail(taskID)
    }

    private var board: Board? {
        guard let task = detail?.task else { return nil }
        return source.boards()?.first { $0.id == task.boardID }
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

    private func list(_ detail: BoardTaskDetail) -> some View {
        List {
            header(detail.task)
            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
            TaskPropertiesSection(
                task: detail.task,
                columns: board?.columns ?? [],
                source: source,
                onFailure: { errorMessage = $0 }
            )
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

    /// The title and the description read as the Task's own words, not as form
    /// fields, so editing them is a deliberate step into a sheet.
    private func header(_ task: BoardTask) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                Text(task.title)
                    .font(.title3.weight(.semibold))
                    .frame(maxWidth: .infinity, alignment: .leading)
                if task.description.isEmpty {
                    Button("Add a description") { showsEditor = true }
                        .buttonStyle(.borderless)
                        .font(.subheadline)
                } else {
                    RichMessageContentView(
                        blocks: RichMessageBlockParser.blocks(task.description) { _, _, _ in nil },
                        textStyle: .subheadline
                    )
                }
            }
            .padding(.vertical, 4)
        }
    }

    private func facts(_ task: BoardTask) -> some View {
        Section {
            if let board {
                LabeledContent("Board", value: board.name)
            }
            // Two rows, because one `Blippy · Nov 5, 2026` value wraps mid-date
            // at accessibility sizes.
            if let creator = source.actor(task.createdBy)?.name {
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

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            Menu {
                Button { showsEditor = true } label: {
                    Label("Edit", systemImage: "pencil")
                }
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
    /// after the Task has landed is a note on it, not the loss of the screen.
    private func load() async {
        do {
            async let detail: Void = source.loadDetail(taskID)
            async let boards: Void = source.loadBoards()
            async let labels: Void = source.loadLabels()
            _ = try await (detail, boards, labels)
            failure = nil
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            if detail == nil {
                failure = error.localizedDescription
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }
}

#Preview("Task") {
    NavigationStack {
        TaskDetailView(
            taskID: "task_12",
            source: .preview,
            onOpenMention: { _ in },
            onOpenReminder: { _ in }
        )
    }
}

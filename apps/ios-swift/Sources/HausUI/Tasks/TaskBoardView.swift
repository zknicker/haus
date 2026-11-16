import HausModels
import SwiftUI

/// One board, as a list sectioned by column.
///
/// A phone shows one column's width at a time, so a horizontal board would hide
/// everything but the column in view; a sectioned list keeps the whole board one
/// scroll away and reads top to bottom in column order. Finished columns start
/// folded, so open work stays near the top however long the history gets.
public struct TaskBoardView: View {
    private let boardID: String
    private let source: TaskBoardSource
    private let onOpenTask: (String) -> Void

    @State private var filter = BoardTaskFilter()
    /// The reader's own folding. Nil until they fold something, when finished
    /// columns are what is folded.
    @State private var foldedColumnIDs: Set<String>?
    @State private var newTaskColumnID: NewTaskRequest?
    @State private var showsSettings = false
    @State private var failure: String?
    @State private var errorMessage: String?
    @State private var moveFeedback = 0

    public init(boardID: String, source: TaskBoardSource, onOpenTask: @escaping (String) -> Void) {
        self.boardID = boardID
        self.source = source
        self.onOpenTask = onOpenTask
    }

    public var body: some View {
        content
            .navigationTitle(board?.name ?? "")
            .hausInlineNavigationTitle()
            .toolbar { toolbar }
            .task { await load() }
            .refreshable { await load() }
            .sensoryFeedback(.success, trigger: moveFeedback)
            .sheet(item: $newTaskColumnID) { request in
                if let board {
                    NewTaskSheet(board: board, source: source, initialColumnID: request.columnID)
                }
            }
            .sheet(isPresented: $showsSettings) {
                if let board {
                    BoardSettingsSheet(board: board, tasks: tasks ?? [], source: source)
                }
            }
    }

    private var board: Board? {
        source.boards()?.first { $0.id == boardID }
    }

    private var tasks: [BoardTask]? {
        source.tasks(boardID)
    }

    @ViewBuilder
    private var content: some View {
        if let board, let tasks {
            list(board, tasks)
        } else if let failure {
            ContentUnavailableView {
                Label("Board unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(failure)
            } actions: {
                Button("Try again") { Task { await load() } }
                    .buttonStyle(.borderedProminent)
            }
        } else {
            // Blank until the board and its Tasks land together.
            Color.clear
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func list(_ board: Board, _ tasks: [BoardTask]) -> some View {
        let visible = tasks.filter(filter.matches)
        let labels = source.labels()
        return List {
            summary(tasks: visible)
            ForEach(BoardTaskGroups.groups(columns: board.columns, tasks: visible)) { group in
                Section {
                    if !isFolded(group.column) {
                        ForEach(group.tasks) { task in
                            TaskBoardRow(
                                task: task,
                                labels: labels.filter { task.labelIDs.contains($0.id) },
                                assignee: task.assignee.flatMap(source.actor),
                                columns: board.columns,
                                onOpen: { onOpenTask(task.id) },
                                onMove: { column in move(task, to: column) }
                            )
                        }
                    }
                } header: {
                    TaskColumnHeader(
                        column: group.column,
                        count: group.tasks.count,
                        isCollapsed: isFolded(group.column),
                        onAdd: board.isArchived ? nil : {
                            newTaskColumnID = NewTaskRequest(columnID: group.column.id)
                        },
                        onToggle: { toggle(group.column, in: board) }
                    )
                }
            }
        }
        .listStyle(.plain)
        .hausCompactListSections()
    }

    /// What the columns add up to, and the one thing the board flags: an Agent
    /// holding more than one active Task. The Server does not stop it, so it is
    /// stated rather than refused.
    @ViewBuilder
    private func summary(tasks: [BoardTask]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(BoardTaskGroups.summary(tasks))
                .font(.footnote)
                .foregroundStyle(.secondary)
            ForEach(BoardTaskGroups.overloadedAgents(tasks), id: \.agentID) { held in
                Label(
                    "\(source.actor(.agent(agentID: held.agentID))?.name ?? "An Agent") holds \(held.count) active tasks",
                    systemImage: "exclamationmark.circle"
                )
                .font(.footnote)
                .foregroundStyle(.orange)
            }
            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        }
        .listRowSeparator(.hidden)
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            filterMenu
            Button { showsSettings = true } label: {
                Label("Board settings", systemImage: "ellipsis")
            }
            if board?.isArchived == false {
                Button {
                    newTaskColumnID = NewTaskRequest(columnID: nil)
                } label: {
                    Label("New task", systemImage: "plus")
                }
            }
        }
    }

    private var filterMenu: some View {
        Menu {
            Picker("Assignee", selection: $filter.assignee) {
                Text("Anyone").tag(BoardTaskFilter.Assignee.anyone)
                Text("Unassigned").tag(BoardTaskFilter.Assignee.unassigned)
                ForEach(source.assignees()) { option in
                    Text(option.name).tag(BoardTaskFilter.Assignee.actor(option.actor))
                }
            }
            .pickerStyle(.menu)
            Picker("Label", selection: $filter.labelID) {
                Text("Any label").tag(String?.none)
                ForEach(source.labels()) { label in
                    Text(label.name).tag(String?.some(label.id))
                }
            }
            .pickerStyle(.menu)
        } label: {
            Label(
                "Filter",
                systemImage: filter.isActive
                    ? "line.3.horizontal.decrease.circle.fill"
                    : "line.3.horizontal.decrease.circle"
            )
        }
    }

    private func isFolded(_ column: BoardColumn) -> Bool {
        foldedColumnIDs?.contains(column.id) ?? column.category.isClosed
    }

    private func toggle(_ column: BoardColumn, in board: Board) {
        var folded = foldedColumnIDs ?? Set(board.columns.filter(\.category.isClosed).map(\.id))
        if !folded.insert(column.id).inserted { folded.remove(column.id) }
        withAnimation(.snappy) { foldedColumnIDs = folded }
    }

    private func move(_ task: BoardTask, to column: BoardColumn) {
        errorMessage = nil
        Task {
            do {
                try await source.moveTask(task, column.id)
                moveFeedback += 1
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func load() async {
        do {
            async let boards: Void = source.loadBoards()
            async let tasks: Void = source.loadTasks(boardID)
            async let labels: Void = source.loadLabels()
            _ = try await (boards, tasks, labels)
            failure = nil
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            if board == nil || tasks == nil {
                failure = error.localizedDescription
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }
}

/// A New task sheet's opening: which column asked, or nil for the board's own
/// default.
struct NewTaskRequest: Identifiable {
    let id = UUID()
    let columnID: String?
}

#Preview("Board") {
    NavigationStack {
        TaskBoardView(boardID: "board_security", source: .preview, onOpenTask: { _ in })
    }
}

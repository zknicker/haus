import HausModels
import SwiftUI

/// New task, as a sheet over the board. A Task needs only a title; everything
/// else keeps the Server's default until someone sets it. The sheet overlays
/// the board rather than moving it, and its detents leave the board in view.
struct NewTaskSheet: View {
    let board: Board
    let source: TaskBoardSource

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var description = ""
    /// Nil is the board's default column, the first `todo`.
    @State private var columnID: String?
    @State private var assignee: TaskActor?
    @State private var priority = TaskPriority.none
    @State private var hasDueDate = false
    @State private var dueDate = Date.now
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(board: Board, source: TaskBoardSource, initialColumnID: String?) {
        self.board = board
        self.source = source
        _columnID = State(initialValue: initialColumnID ?? board.firstColumn(in: .todo)?.id)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $title, axis: .vertical)
                        .lineLimit(1...4)
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(3...8)
                }
                Section {
                    Picker("Status", selection: $columnID) {
                        ForEach(board.columns) { column in
                            Label(column.name, systemImage: column.category.symbolName)
                                .tag(String?.some(column.id))
                        }
                    }
                    .pickerStyle(.menu)
                    Picker("Assignee", selection: $assignee) {
                        Text("Unassigned").tag(TaskActor?.none)
                        ForEach(source.assignees()) { option in
                            Text(option.name).tag(TaskActor?.some(option.actor))
                        }
                    }
                    .pickerStyle(.menu)
                    Picker("Priority", selection: $priority) {
                        ForEach(TaskPriority.ordered, id: \.self) { priority in
                            Text(priority.displayName).tag(priority)
                        }
                    }
                    .pickerStyle(.menu)
                    Toggle("Due date", isOn: $hasDueDate)
                    if hasDueDate {
                        DatePicker("Due", selection: $dueDate, displayedComponents: .date)
                    }
                } footer: {
                    if let errorMessage {
                        Text(errorMessage).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("New task")
            .hausInlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { Task { await create() } }
                        .disabled(trimmedTitle.isEmpty || isSaving)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func create() async {
        isSaving = true
        defer { isSaving = false }
        let draft = TaskDraft(
            boardID: board.id,
            title: trimmedTitle,
            description: description,
            columnID: columnID,
            assignee: assignee,
            priority: priority,
            labelIDs: [],
            dueOn: hasDueDate ? TaskDueDate.dueOn(from: dueDate) : nil
        )
        do {
            _ = try await source.createTask(draft)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// New board: a name and the key its Tasks read under. The key follows the
/// name until someone types their own, and every new board starts with the
/// Server's default columns.
struct NewBoardSheet: View {
    let source: TaskBoardSource
    let onCreated: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var key = ""
    @State private var keyWasEdited = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                    TextField("Key", text: keyBinding)
                        .hausHandleInput()
                } footer: {
                    if let errorMessage {
                        Text(errorMessage).foregroundStyle(.red)
                    } else {
                        Text("Tasks read as \(key.isEmpty ? "KEY" : key)-12. A key is 2 to 5 capital letters or digits.")
                    }
                }
            }
            .navigationTitle("New board")
            .hausInlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { Task { await create() } }
                        .disabled(!canCreate)
                }
            }
            .onChange(of: name) { _, name in
                guard !keyWasEdited else { return }
                key = Board.suggestedKey(forName: name)
            }
        }
        .presentationDetents([.medium])
    }

    private var keyBinding: Binding<String> {
        Binding(
            get: { key },
            set: { value in
                keyWasEdited = true
                key = value.uppercased()
            }
        )
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canCreate: Bool {
        !isSaving && !trimmedName.isEmpty && Board.isValidKey(key)
    }

    private func create() async {
        isSaving = true
        defer { isSaving = false }
        do {
            let board = try await source.createBoard(key, trimmedName)
            dismiss()
            onCreated(board.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview("New task") {
    NewTaskSheet(board: TaskPreviewFixtures.boards[0], source: .preview, initialColumnID: nil)
}

#Preview("New board") {
    NewBoardSheet(source: .preview, onCreated: { _ in })
}

import HausModels
import SwiftUI

/// Board settings: the board's name and key, and its columns.
///
/// The column list is one draft, saved as one `board.setColumns`, so a person
/// can rename, reorder, add, and remove and then decide. Removing a column
/// that holds Tasks asks where they go, and the last column of a required
/// category offers no delete and no other category: the invariant is locked in
/// the control rather than refused after Save.
struct BoardSettingsSheet: View {
    let board: Board
    let source: TaskBoardSource

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var key: String
    @State private var drafts: [BoardColumnDraft]
    @State private var targets: [String: String] = [:]
    @State private var isSaving = false
    @State private var errorMessage: String?
    private let taskCounts: [String: Int]

    init(board: Board, tasks: [BoardTask], source: TaskBoardSource) {
        self.board = board
        self.source = source
        taskCounts = BoardTaskGroups.counts(tasks)
        _name = State(initialValue: board.name)
        _key = State(initialValue: board.key)
        _drafts = State(initialValue: board.columns.map(BoardColumnDraft.init(column:)))
    }

    var body: some View {
        NavigationStack {
            Form {
                nameSection
                columnsSection
                if !plan.removedWithTasks.isEmpty { movesSection }
                archiveSection
            }
            #if os(iOS)
            // Always editing, so a column's handle and delete control are there
            // without a mode to enter first.
            .environment(\.editMode, .constant(.active))
            #endif
            .navigationTitle("Board settings")
            .hausInlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(!canSave)
                }
            }
        }
        .presentationDetents([.large])
    }

    private var plan: BoardColumnPlan {
        BoardColumnPlan(original: board.columns, drafts: drafts, taskCounts: taskCounts, targets: targets)
    }

    private var nameSection: some View {
        Section {
            LabeledContent("Name") {
                TextField("Name", text: $name)
                    .multilineTextAlignment(.trailing)
            }
            // The General board keeps its key.
            LabeledContent("Key") {
                if board.isGeneral {
                    Text(board.key)
                } else {
                    TextField("Key", text: keyBinding)
                        .multilineTextAlignment(.trailing)
                        .hausHandleInput()
                }
            }
        } footer: {
            if !board.isGeneral, key != board.key, Board.isValidKey(key) {
                Text("Every Task on this board will read as \(key)-1, \(key)-2, and so on.")
            }
        }
    }

    private var columnsSection: some View {
        Section {
            ForEach($drafts) { $draft in
                BoardColumnRow(draft: $draft, canChangeCategory: plan.canChangeCategory(draft))
                    .deleteDisabled(!plan.canRemove(draft))
            }
            .onMove { drafts.move(fromOffsets: $0, toOffset: $1) }
            .onDelete { drafts.remove(atOffsets: $0) }

            Button {
                drafts.append(BoardColumnDraft(name: "", category: .active))
            } label: {
                Label("Add column", systemImage: "plus")
            }
        } header: {
            Text("Columns")
        } footer: {
            VStack(alignment: .leading, spacing: 4) {
                Text("A board always keeps one Todo, one Active, and one Done column. Category decides what counts as open.")
                ForEach(problemNotes, id: \.self) { note in
                    Text(note).foregroundStyle(.red)
                }
            }
        }
    }

    /// Each removed column that holds Tasks, and where they go. The draft keeps
    /// the column gone either way, so this is the one question Save waits on.
    private var movesSection: some View {
        Section {
            ForEach(plan.removedWithTasks) { column in
                Picker(moveTitle(column), selection: targetBinding(column)) {
                    Text("Choose").tag(String?.none)
                    ForEach(plan.targetChoices) { choice in
                        Text(choice.name).tag(choice.columnID)
                    }
                }
                .pickerStyle(.menu)
            }
        } header: {
            Text("Move tasks")
        } footer: {
            Text("A removed column's tasks move to the column you pick.")
        }
    }

    @ViewBuilder
    private var archiveSection: some View {
        if !board.isGeneral {
            Section {
                Button(board.isArchived ? "Restore board" : "Archive board", role: board.isArchived ? nil : .destructive) {
                    Task { await setArchived(!board.isArchived) }
                }
                .disabled(isSaving)
            } footer: {
                if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                }
            }
        } else if let errorMessage {
            Section {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
    }

    private func moveTitle(_ column: BoardColumn) -> String {
        let count = taskCounts[column.id, default: 0]
        return "\(column.name) · \(count)"
    }

    private var problemNotes: [String] {
        var notes: [String] = []
        for problem in plan.problems {
            let note: String? = switch problem {
            case .blankName: "Every column needs a name."
            case .nameTooLong: "Column names are at most \(BoardColumnPlan.nameMaxLength) characters."
            case .duplicateName(let name): "\"\(name)\" is used twice."
            case .missingCategory(let category): "A \(category.displayName) column is required."
            case .needsTarget: nil
            }
            if let note, !notes.contains(note) { notes.append(note) }
        }
        return notes
    }

    private var keyBinding: Binding<String> {
        Binding(get: { key }, set: { key = $0.uppercased() })
    }

    private func targetBinding(_ column: BoardColumn) -> Binding<String?> {
        Binding(get: { targets[column.id] }, set: { targets[column.id] = $0 })
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var patch: BoardUpdatePatch {
        BoardUpdatePatch(
            name: trimmedName == board.name ? nil : trimmedName,
            key: key == board.key ? nil : key
        )
    }

    private var columnsChanged: Bool {
        drafts != board.columns.map(BoardColumnDraft.init(column:))
    }

    private var canSave: Bool {
        !isSaving
            && !trimmedName.isEmpty
            && Board.isValidKey(key)
            && plan.isValid
            && (!patch.isEmpty || columnsChanged)
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await source.saveBoard(board, patch, columnsChanged ? plan : nil)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func setArchived(_ archived: Bool) async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await source.saveBoard(board, BoardUpdatePatch(archived: archived), nil)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// One column in the editor: its name and its category. At accessibility sizes
/// the category stacks under the name rather than squeezing it.
private struct BoardColumnRow: View {
    @Binding var draft: BoardColumnDraft
    let canChangeCategory: Bool

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 6) {
                nameField
                categoryControl
            }
        } else {
            HStack(spacing: 8) {
                nameField
                categoryControl
            }
        }
    }

    private var nameField: some View {
        TextField("Column name", text: $draft.name)
    }

    @ViewBuilder
    private var categoryControl: some View {
        if canChangeCategory {
            Picker("Category", selection: $draft.category) {
                ForEach(ColumnCategory.allCases, id: \.self) { category in
                    Label(category.displayName, systemImage: category.symbolName).tag(category)
                }
            }
            .pickerStyle(.menu)
            .labelsHidden()
            .fixedSize()
        } else {
            // Locked: it is the board's last column of this category.
            Text(draft.category.displayName)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .accessibilityLabel("\(draft.category.displayName), required")
        }
    }
}

#Preview("Board settings") {
    BoardSettingsSheet(
        board: TaskPreviewFixtures.boards[0],
        tasks: TaskPreviewFixtures.tasks,
        source: .preview
    )
}

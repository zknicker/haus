import HausModels
import SwiftUI

/// Editing a Task's words: its title and its Markdown description, saved as one
/// `task.update`. A refused save, usually a stale version, stays open with what
/// was typed.
struct TaskEditorSheet: View {
    let task: BoardTask
    let source: TaskBoardSource

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var description: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(task: BoardTask, source: TaskBoardSource) {
        self.task = task
        self.source = source
        _title = State(initialValue: task.title)
        _description = State(initialValue: task.description)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField("Title", text: $title, axis: .vertical)
                        .lineLimit(1...4)
                }
                Section {
                    TextEditor(text: $description)
                        .frame(minHeight: 220)
                } header: {
                    Text("Description")
                } footer: {
                    if let errorMessage {
                        Text(errorMessage).foregroundStyle(.red)
                    } else {
                        Text("Markdown. Link files here; a Task has no attachments.")
                    }
                }
            }
            .navigationTitle(task.key)
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

    private var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSave: Bool {
        !isSaving && !trimmedTitle.isEmpty && (trimmedTitle != task.title || description != task.description)
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        let patch = TaskUpdatePatch(
            title: trimmedTitle == task.title ? nil : trimmedTitle,
            description: description == task.description ? nil : description
        )
        do {
            try await source.updateTask(task, patch)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview("Edit task") {
    TaskEditorSheet(task: TaskPreviewFixtures.detail.task, source: .preview)
}

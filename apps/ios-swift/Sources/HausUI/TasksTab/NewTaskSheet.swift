import HausModels
import SwiftUI

/// What "New task" sends: `task.create` needs a Project and a Captain.
public struct NewTaskDraft: Equatable, Sendable {
    public var title = ""
    public var details = ""
    public var projectID: String?
    public var captainID: String?

    public init(title: String = "", details: String = "", projectID: String? = nil, captainID: String? = nil) {
        self.title = title
        self.details = details
        self.projectID = projectID
        self.captainID = captainID
    }

    public var trimmedTitle: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }

    public var canCreate: Bool {
        !trimmedTitle.isEmpty && trimmedTitle.utf16.count <= TaskText.titleMaxCharacters
            && projectID != nil && captainID != nil
    }

    /// The Captain a Project's new Task goes to unless the reader picks
    /// another: one homed in the Project, else the first Captain.
    static func defaultCaptainID(for project: TaskProjectOption?, captains: [TaskPersonOption]) -> String? {
        let ids = captains.compactMap(\.actor.agentID)
        return project?.homeAgentIDs.first(where: ids.contains) ?? ids.first
    }
}

/// The New task sheet. The draft stays while the create runs and after it
/// fails, so a refused send loses nothing.
struct NewTaskSheet: View {
    let projects: [TaskProjectOption]
    let captains: [TaskPersonOption]
    let onCreate: (NewTaskDraft) async throws -> Void

    @State private var draft = NewTaskDraft()
    @State private var isCreating = false
    @State private var failure: String?
    @FocusState private var isTitleFocused: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $draft.title, axis: .vertical)
                        .focused($isTitleFocused)
                        .lineLimit(1...4)
                    TextField("Description", text: $draft.details, axis: .vertical)
                        .lineLimit(2...8)
                }
                Section {
                    Picker("Project", selection: projectSelection) {
                        ForEach(projects) { Text($0.name).tag(Optional($0.id)) }
                    }
                    Picker("Captain", selection: $draft.captainID) {
                        ForEach(captains) { person in
                            Text(person.name).tag(person.actor.agentID)
                        }
                    }
                } footer: {
                    if let failure {
                        Text(failure).foregroundStyle(HausPlatformColor.critical)
                    }
                }
            }
            .navigationTitle("New task")
            .hausInlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create", systemImage: "checkmark", role: .confirm) { create() }
                        .disabled(!draft.canCreate || isCreating)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear(perform: seed)
        .interactiveDismissDisabled(isCreating)
    }

    private var projectSelection: Binding<String?> {
        Binding(
            get: { draft.projectID },
            set: { id in
                draft.projectID = id
                let project = projects.first { $0.id == id }
                draft.captainID = NewTaskDraft.defaultCaptainID(for: project, captains: captains)
            }
        )
    }

    private func seed() {
        isTitleFocused = true
        guard draft.projectID == nil, let project = projects.first else { return }
        draft.projectID = project.id
        draft.captainID = NewTaskDraft.defaultCaptainID(for: project, captains: captains)
    }

    private func create() {
        isCreating = true
        failure = nil
        Task {
            do {
                try await onCreate(draft)
                dismiss()
            } catch {
                failure = error.localizedDescription
            }
            isCreating = false
        }
    }
}

import HausModels
import SwiftUI

/// A Device a Project's repos can be checked out on, or its Workers run on.
public struct ProjectSettingsDevice: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

/// The writes Project settings make. Each throws the Server's refusal, which
/// the screen shows under the section that asked.
public struct ProjectSettingsActions {
    let save: (_ name: String?, _ key: String?) async throws -> Void
    let addRepo: (String) async throws -> Void
    let removeRepo: (String) async throws -> Void
    let linkRepo: (_ repoID: String, _ computerID: String) async throws -> Void
    let unlinkRepo: (_ repoID: String, _ computerID: String) async throws -> Void
    let setDefaultPlace: (WorkerPlaceTarget?) async throws -> Void

    public init(
        save: @escaping (_ name: String?, _ key: String?) async throws -> Void,
        addRepo: @escaping (String) async throws -> Void,
        removeRepo: @escaping (String) async throws -> Void,
        linkRepo: @escaping (_ repoID: String, _ computerID: String) async throws -> Void,
        unlinkRepo: @escaping (_ repoID: String, _ computerID: String) async throws -> Void,
        setDefaultPlace: @escaping (WorkerPlaceTarget?) async throws -> Void
    ) {
        self.save = save
        self.addRepo = addRepo
        self.removeRepo = removeRepo
        self.linkRepo = linkRepo
        self.unlinkRepo = unlinkRepo
        self.setDefaultPlace = setDefaultPlace
    }
}

/// A Project's settings, pushed from its row: name and key, repositories with
/// the Devices they are checked out on, and where its Workers run by default.
public struct ProjectSettingsView: View {
    private let project: Project?
    private let devices: [ProjectSettingsDevice]
    private let actions: ProjectSettingsActions

    @State private var nameDraft = ""
    @State private var keyDraft = ""
    @State private var identityError: String?
    @State private var placeError: String?
    @State private var isSaving = false

    public init(project: Project?, devices: [ProjectSettingsDevice], actions: ProjectSettingsActions) {
        self.project = project
        self.devices = devices
        self.actions = actions
    }

    public var body: some View {
        Group {
            if let project {
                form(project)
            } else {
                Color.clear
            }
        }
        .background(HausPlatformColor.canvas)
        .navigationTitle(project.map { "#\($0.name)" } ?? "Project")
        .hausInlineNavigationTitle()
    }

    private func form(_ project: Project) -> some View {
        Form {
            Section {
                TextField("Name", text: $nameDraft)
                    .hausHandleInput()
                if project.keyEditable {
                    TextField("Key", text: $keyDraft)
                        .hausHandleInput()
                } else {
                    LabeledContent("Key", value: project.key.rawValue)
                }
            } header: {
                Text("Project")
            } footer: {
                footer(error: identityError, note: project.keyEditable ? "The key prefixes every Task, like \(keyDraft.isEmpty ? project.key.rawValue : keyDraft)-1." : "The key is fixed once the project has a Task.")
            }
            ProjectReposSection(project: project, devices: devices, actions: actions)
            Section {
                Picker("Default Worker place", selection: placeBinding(project)) {
                    Text("Ask each time").tag(WorkerPlaceTarget?.none)
                    ForEach(devices) { device in
                        Text(device.name).tag(WorkerPlaceTarget?.some(.computer(id: device.id)))
                    }
                    Text("Cursor").tag(WorkerPlaceTarget?.some(.cursor))
                    Text("Claude").tag(WorkerPlaceTarget?.some(.claude))
                }
            } header: {
                Text("Workers")
            } footer: {
                footer(error: placeError, note: "Where this project's Workers run unless someone picks a place.")
            }
        }
        .scrollContentBackground(.hidden)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save", systemImage: "checkmark") { save(project) }
                    .disabled(!hasChanges(project) || isSaving)
            }
        }
        .task(id: project.id) {
            nameDraft = project.name
            keyDraft = project.key.rawValue
        }
    }

    private func footer(error: String?, note: String) -> some View {
        Text(error ?? note)
            .foregroundStyle(error == nil ? HausPlatformColor.mutedInk : HausPlatformColor.critical)
    }

    private func hasChanges(_ project: Project) -> Bool {
        trimmed(nameDraft) != project.name || (project.keyEditable && trimmed(keyDraft) != project.key.rawValue)
    }

    private func save(_ project: Project) {
        let name = trimmed(nameDraft)
        let key = trimmed(keyDraft)
        isSaving = true
        Task {
            defer { isSaving = false }
            do {
                try await actions.save(
                    name == project.name ? nil : name,
                    project.keyEditable && key != project.key.rawValue ? key : nil
                )
                identityError = nil
            } catch {
                identityError = error.localizedDescription
            }
        }
    }

    private func placeBinding(_ project: Project) -> Binding<WorkerPlaceTarget?> {
        Binding(
            get: { project.defaultWorkerPlace?.target },
            set: { place in
                Task {
                    do {
                        try await actions.setDefaultPlace(place)
                        placeError = nil
                    } catch {
                        placeError = error.localizedDescription
                    }
                }
            }
        )
    }

    private func trimmed(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

extension WorkerPlace {
    /// The place as the target a write names. Nil for a kind this build does
    /// not know.
    var target: WorkerPlaceTarget? {
        switch kind {
        case "computer": computerId.map { .computer(id: $0) }
        case "cursor": .cursor
        case "claude": .claude
        default: nil
        }
    }
}

import HausModels
import SwiftUI

/// A Device a Project's Tasks can run on by default.
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
    let setDefaultMachine: (_ computerID: String?) async throws -> Void

    public init(
        save: @escaping (_ name: String?, _ key: String?) async throws -> Void,
        setDefaultMachine: @escaping (_ computerID: String?) async throws -> Void
    ) {
        self.save = save
        self.setDefaultMachine = setDefaultMachine
    }
}

/// A Project's settings, pushed from its row: name and key, and the Machine
/// its Tasks run on by default.
public struct ProjectSettingsView: View {
    private let project: Project?
    private let devices: [ProjectSettingsDevice]
    private let actions: ProjectSettingsActions

    @State private var nameDraft = ""
    @State private var keyDraft = ""
    @State private var identityError: String?
    @State private var machineError: String?
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
                footer(error: identityError, note: keyNote(project))
            }
            Section {
                Picker("Default Machine", selection: machineBinding(project)) {
                    Text("No default").tag(String?.none)
                    ForEach(machineChoices(project)) { device in
                        Text(device.name).tag(String?.some(device.id))
                    }
                }
            } footer: {
                footer(error: machineError, note: "Where a Task started here runs unless someone picks a Machine.")
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

    private func keyNote(_ project: Project) -> String {
        guard project.keyEditable else { return "The key is fixed once the project has an Issue." }
        return "The key prefixes every Issue, like \(keyDraft.isEmpty ? project.key.rawValue : keyDraft)-1."
    }

    /// The Devices, plus the current default when it is no longer listed.
    private func machineChoices(_ project: Project) -> [ProjectSettingsDevice] {
        guard let current = project.defaultMachine, !devices.contains(where: { $0.id == current.computerID }) else {
            return devices
        }
        return devices + [ProjectSettingsDevice(id: current.computerID, name: current.computerName ?? "Device")]
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

    private func machineBinding(_ project: Project) -> Binding<String?> {
        Binding(
            get: { project.defaultMachine?.computerID },
            set: { computerID in
                Task {
                    do {
                        try await actions.setDefaultMachine(computerID)
                        machineError = nil
                    } catch {
                        machineError = error.localizedDescription
                    }
                }
            }
        )
    }

    private func trimmed(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

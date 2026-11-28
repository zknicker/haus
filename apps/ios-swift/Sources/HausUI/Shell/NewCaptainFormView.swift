import HausModels
import SwiftUI

/// What the New Captain form hands the App for `agent.create`.
public struct NewCaptainDraft: Equatable, Sendable {
    public let name: String
    public let handle: String
    public let projectID: String
    public let deviceID: String
    public let runtimeID: String
    public let modelID: String
}

/// A new Captain: a name, a home Project, and the Device and model it runs on.
/// `agent.create` refuses a Captain without a home Project and a Device.
public struct NewCaptainFormView: View {
    private let projects: [AskAnythingChoice]
    private let devices: [AskAnythingChoice]
    private let runtimes: [SettingsRuntime]
    private let create: (NewCaptainDraft) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var handle = ""
    @State private var projectID: String?
    @State private var deviceID: String?
    @State private var runtimeID: String?
    @State private var modelID: String?
    @State private var isCreating = false
    @State private var error: String?

    public init(
        projects: [AskAnythingChoice],
        devices: [AskAnythingChoice],
        runtimes: [SettingsRuntime],
        create: @escaping (NewCaptainDraft) async throws -> Void
    ) {
        self.projects = projects
        self.devices = devices
        self.runtimes = runtimes
        self.create = create
    }

    public var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                        .onChange(of: name) { previous, current in
                            if handle.isEmpty || handle == Self.handle(from: previous) { handle = Self.handle(from: current) }
                        }
                    TextField("Handle", text: $handle)
                        #if os(iOS)
                        .textInputAutocapitalization(.never)
                        #endif
                        .autocorrectionDisabled()
                } footer: {
                    if !handle.isEmpty, !ParticipantHandle.isValid(handle) {
                        Text("Use 2 to 31 lowercase letters, numbers, or dashes.")
                    }
                }
                Section {
                    Picker("Home project", selection: $projectID) { options(projects) }
                    Picker("Device", selection: $deviceID) { options(devices) }
                }
                Section {
                    Picker("Runtime", selection: $runtimeID) {
                        options(runtimes.map { AskAnythingChoice(id: $0.id, name: $0.label) })
                    }
                    Picker("Model", selection: $modelID) {
                        options(models.map { AskAnythingChoice(id: $0.id, name: $0.label) })
                    }
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("New Captain")
            .hausInlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { Task { await submit() } }
                        .disabled(draft == nil || isCreating)
                }
            }
            .onAppear(perform: chooseDefaults)
            .onChange(of: projects) { chooseDefaults() }
            .onChange(of: devices) { chooseDefaults() }
            .onChange(of: runtimes) { chooseDefaults() }
            .onChange(of: runtimeID) { modelID = models.first?.id }
        }
        .presentationDetents([.large])
    }

    private var models: [SettingsRuntimeModel] {
        runtimes.first { $0.id == runtimeID }?.models ?? []
    }

    private var draft: NewCaptainDraft? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, ParticipantHandle.isValid(handle),
              let projectID, let deviceID, let runtimeID, let modelID
        else { return nil }
        return NewCaptainDraft(
            name: trimmed,
            handle: handle.lowercased(),
            projectID: projectID,
            deviceID: deviceID,
            runtimeID: runtimeID,
            modelID: modelID
        )
    }

    private func options(_ choices: [AskAnythingChoice]) -> some View {
        ForEach(choices) { choice in
            Text(choice.name).tag(Optional(choice.id))
        }
    }

    private func chooseDefaults() {
        projectID = projectID ?? projects.first?.id
        deviceID = deviceID ?? devices.first?.id
        runtimeID = runtimeID ?? runtimes.first?.id
        modelID = modelID ?? models.first?.id
    }

    private func submit() async {
        guard let draft else { return }
        isCreating = true
        defer { isCreating = false }
        do {
            try await create(draft)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    nonisolated static func handle(from name: String) -> String {
        let lowered = name.lowercased().map { $0.isLetter || $0.isNumber ? $0 : "-" }
        let collapsed = String(lowered).split(separator: "-").joined(separator: "-")
        return String(collapsed.prefix(31))
    }
}

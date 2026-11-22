import Foundation
import SwiftUI

public struct NewChannelAgentPresentation: Identifiable, Hashable, Sendable {
    public let id: String
    public let displayName: String
    public let avatarURL: URL?

    public init(id: String, displayName: String, avatarURL: URL? = nil) {
        self.id = id
        self.displayName = displayName
        self.avatarURL = avatarURL
    }
}

public struct NewChannelDraft: Equatable, Sendable {
    public let agentIDs: [String]
    public let name: String

    public init(agentIDs: [String], name: String) {
        self.agentIDs = agentIDs
        self.name = name
    }
}

public struct CreatedChannelPresentation: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

public enum NewChannelNameValidation: Equatable, Sendable {
    case valid
    case empty
    case tooLong
    case invalidCharacters

    public var message: String? {
        switch self {
        case .valid:
            nil
        case .empty:
            "Enter a project name."
        case .tooLong:
            "Use 32 characters or fewer."
        case .invalidCharacters:
            "Use letters, numbers, hyphens, or underscores."
        }
    }

    public var isValid: Bool {
        self == .valid
    }

    public static func validate(_ rawName: String) -> Self {
        let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return .empty }
        guard name.count <= 32 else { return .tooLong }
        guard name.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else {
            return .invalidCharacters
        }
        return .valid
    }
}

/// Native channel creation form. It mirrors `project.create` validation so
/// invalid requests are caught before the injected Server mutation runs.
public struct NewChannelFormView: View {
    @Environment(\.dismiss) private var dismiss

    private let agents: [NewChannelAgentPresentation]
    private let create: @Sendable (NewChannelDraft) async throws -> CreatedChannelPresentation
    private let onCreated: (CreatedChannelPresentation) -> Void

    @State private var name = ""
    @State private var selectedAgentIDs: Set<String> = []
    @State private var isSubmitting = false
    @State private var submitError: String?
    @FocusState private var isNameFocused: Bool

    public init(
        agents: [NewChannelAgentPresentation],
        create: @escaping @Sendable (NewChannelDraft) async throws -> CreatedChannelPresentation,
        onCreated: @escaping (CreatedChannelPresentation) -> Void = { _ in }
    ) {
        self.agents = agents
        self.create = create
        self.onCreated = onCreated
    }

    public var body: some View {
        NavigationStack {
            Form {
                Section {
#if os(iOS)
                    TextField("Project name", text: $name)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.done)
                        .focused($isNameFocused)
#else
                    TextField("Project name", text: $name)
                        .focused($isNameFocused)
#endif

                    // An untouched empty field is not an error; the disabled
                    // Create button and the footer already explain the rules.
                    if !name.isEmpty, let message = nameValidation.message {
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                } header: {
                    Text("Project")
                } footer: {
                    Text("Use up to 32 characters: letters, numbers, hyphens, and underscores.")
                }

                Section {
                    ForEach(agents) { agent in
                        Button {
                            toggle(agent.id)
                        } label: {
                            HStack(spacing: 12) {
                                AvatarView(name: agent.displayName, url: agent.avatarURL, size: 32)
                                Text(agent.displayName)
                                    .foregroundStyle(.primary)
                                Spacer(minLength: 8)
                                Image(systemName: selectedAgentIDs.contains(agent.id) ? "checkmark.circle.fill" : "circle")
                                    .font(.title3)
                                    .foregroundStyle(
                                        selectedAgentIDs.contains(agent.id) ? HausPlatformColor.accentInk : Color.secondary
                                    )
                                    .accessibilityHidden(true)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                } header: {
                    Text("Captains")
                } footer: {
                    Text("Choose at least one Captain for this project.")
                }
            }
            .navigationTitle("New project")
            .hausInlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await submit() }
                    } label: {
                        if isSubmitting {
                            ProgressView()
                        } else {
                            Text("Create")
                        }
                    }
                    .disabled(!canSubmit)
                }
            }
            .alert("Couldn’t create project", isPresented: hasSubmitError) {
                Button("OK") { submitError = nil }
            } message: {
                Text(submitError ?? "Try again.")
            }
            .task {
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                isNameFocused = true
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HausPlatformColor.groupedBackground)
    }

    private var nameValidation: NewChannelNameValidation {
        NewChannelNameValidation.validate(name)
    }

    private var canSubmit: Bool {
        nameValidation.isValid && !selectedAgentIDs.isEmpty && !isSubmitting
    }

    private var hasSubmitError: Binding<Bool> {
        Binding(
            get: { submitError != nil },
            set: { if !$0 { submitError = nil } }
        )
    }

    private func toggle(_ agentID: String) {
        if selectedAgentIDs.contains(agentID) {
            selectedAgentIDs.remove(agentID)
        } else {
            selectedAgentIDs.insert(agentID)
        }
    }

    private func submit() async {
        guard canSubmit else { return }
        isSubmitting = true
        submitError = nil
        defer { isSubmitting = false }

        let draft = NewChannelDraft(
            agentIDs: agents.map(\.id).filter { selectedAgentIDs.contains($0) },
            name: name.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        do {
            let channel = try await create(draft)
            guard !Task.isCancelled else { return }
            onCreated(channel)
            dismiss()
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            submitError = error.localizedDescription
        }
    }
}

private enum NewChannelPreviewFixtures {
    static let agents = [
        NewChannelAgentPresentation(id: "cove", displayName: "Cove"),
        NewChannelAgentPresentation(id: "tiny", displayName: "Tiny"),
    ]
}

#Preview("New project") {
    NewChannelFormView(
        agents: NewChannelPreviewFixtures.agents,
        create: { draft in
            CreatedChannelPresentation(id: "new-channel", name: draft.name)
        }
    ) { _ in }
}

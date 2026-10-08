import SwiftUI

struct AgentProfileView: View {
    let agent: SettingsAgent
    let onEditDescription: (String, String) -> Void
    let onSave: (SettingsAgent) async throws -> SettingsAgent
    let onSaveAvatar: @Sendable (AvatarImagePayload) async throws -> Void
    let onOpenAvatarGenerator: () -> Void
    let onOpenRuntimeConfiguration: () -> Void
    @State private var name: String
    @State private var savedName: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(
        agent: SettingsAgent,
        onEditDescription: @escaping (String, String) -> Void,
        onSave: @escaping (SettingsAgent) async throws -> SettingsAgent = { $0 },
        onSaveAvatar: @escaping @Sendable (AvatarImagePayload) async throws -> Void = { _ in },
        onOpenAvatarGenerator: @escaping () -> Void = {},
        onOpenRuntimeConfiguration: @escaping () -> Void = {}
    ) {
        self.agent = agent
        self.onEditDescription = onEditDescription
        self.onSave = onSave
        self.onSaveAvatar = onSaveAvatar
        self.onOpenAvatarGenerator = onOpenAvatarGenerator
        self.onOpenRuntimeConfiguration = onOpenRuntimeConfiguration
        _name = State(initialValue: agent.displayName)
        _savedName = State(initialValue: agent.displayName)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(spacing: 6) {
                    ProfileHero(
                        initials: agent.initials,
                        avatarURL: agent.avatarURL,
                        presence: agent.presence,
                        displayName: name,
                        handle: "@\(agent.handle)",
                        onSaveAvatar: onSaveAvatar
                    )
                    if agent.canGenerateAvatar {
                        AgentAvatarGeneratorEntry(onOpen: onOpenAvatarGenerator)
                    }
                }

                SettingsSection("Identity") {
                    SettingsListGroup {
                        SettingsRow(title: "Name", icon: .account, showsDivider: true, layout: .stacksAtAccessibilitySizes) {
                            TextField("Name", text: $name)
                                .font(.body)
                                .settingsRowValueAlignment()
                                .hausWordsAutocapitalization()
                                .submitLabel(.done)
                                .onSubmit { Task { await saveName() } }
                                .accessibilityLabel("Name")
                        }
                        DisclosureRow(
                            "Description",
                            subtitle: agent.description.isEmpty ? "No description yet." : agent.description,
                            icon: .description,
                            showsDivider: false,
                            action: {
                                onEditDescription(agent.id, "Description")
                            }
                        )
                    }
                }

                AgentExecutionSettingsSection(
                    agent: agent,
                    onOpenRuntimeConfiguration: onOpenRuntimeConfiguration
                )


                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .padding(.horizontal, 16)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.groupedBackground)
        .navigationTitle(agent.displayName)
        .hausInlineNavigationTitle()
        #if os(iOS)
        .toolbarBackground(HausPlatformColor.groupedBackground, for: .navigationBar)
        #endif
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button {
                    Task { await saveName() }
                } label: {
                    if isSaving {
                        ProgressView()
                    } else {
                        Text("Save")
                    }
                }
                .disabled(!hasNameChanges || isSaving)
                .accessibilityLabel("Save name")
            }
        }
    }

    private var hasNameChanges: Bool {
        name.trimmingCharacters(in: .whitespacesAndNewlines) != savedName
    }

    private func saveName() async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, trimmedName != savedName, !isSaving else { return }

        isSaving = true
        errorMessage = nil
        do {
            let draft = SettingsAgent(
                id: agent.id,
                displayName: trimmedName,
                handle: agent.handle,
                description: agent.description,
                runtime: agent.runtime,
                model: agent.model,
                status: agent.status,
                avatarURL: agent.avatarURL,
                presence: agent.presence,
                initials: agent.initials,
                canGenerateAvatar: agent.canGenerateAvatar,
                runtimeConfiguration: agent.runtimeConfiguration
            )
            let saved = try await onSave(draft)
            name = saved.displayName
            savedName = saved.displayName
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}

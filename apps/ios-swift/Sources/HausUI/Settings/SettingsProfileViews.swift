import SwiftUI

struct HumanProfileView: View {
    let person: SettingsPerson
    let onEditDescription: (String, String) -> Void
    let onSave: (SettingsPerson) async throws -> SettingsPerson
    let onSaveAvatar: @Sendable (AvatarImagePayload) async throws -> Void
    @State private var name: String
    @State private var savedName: String
    @State private var handle: String
    @State private var savedHandle: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(
        person: SettingsPerson,
        onEditDescription: @escaping (String, String) -> Void,
        onSave: @escaping (SettingsPerson) async throws -> SettingsPerson = { $0 },
        onSaveAvatar: @escaping @Sendable (AvatarImagePayload) async throws -> Void = { _ in }
    ) {
        self.person = person
        self.onEditDescription = onEditDescription
        self.onSave = onSave
        self.onSaveAvatar = onSaveAvatar
        _name = State(initialValue: person.displayName)
        _savedName = State(initialValue: person.displayName)
        _handle = State(initialValue: person.handle ?? "")
        _savedHandle = State(initialValue: person.handle ?? "")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                ProfileHero(
                    initials: person.initials,
                    avatarURL: person.avatarURL,
                    displayName: name,
                    handle: handle.isEmpty ? nil : "@\(handle)",
                    onSaveAvatar: onSaveAvatar
                )

                SettingsSection("Identity") {
                    SettingsListGroup {
                        SettingsRow(title: "Name", icon: .account, showsDivider: true) {
                            TextField("Name", text: $name)
                                .font(.body)
                                .multilineTextAlignment(.trailing)
                                .hausWordsAutocapitalization()
                                .submitLabel(.done)
                                .onSubmit { Task { await saveIdentity() } }
                                .accessibilityLabel("Name")
                        }
                        SettingsRow(title: "Handle", icon: .handle, showsDivider: true) {
                            TextField("handle", text: $handle)
                                .font(.body)
                                .multilineTextAlignment(.trailing)
                                .hausHandleInput()
                                .submitLabel(.done)
                                .onSubmit { Task { await saveIdentity() } }
                                .accessibilityLabel("Handle")
                        }
                        DisclosureRow(
                            "Description",
                            subtitle: person.description.isEmpty ? "No description yet." : person.description,
                            icon: .description,
                            showsDivider: false,
                            action: {
                                onEditDescription(person.id, "Description")
                            }
                        )
                    }
                }

                SettingsSection("Account") {
                    SettingsListGroup {
                        ValueRow("Email", value: person.email ?? "Unavailable", icon: .email)
                        ValueRow("Role", value: person.role, icon: .permissions)
                        ValueRow("Joined", value: person.joined.isEmpty ? "Unavailable" : person.joined, icon: .calendar, showsDivider: false)
                    }
                }

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
        .navigationTitle("Profile")
        .hausInlineNavigationTitle()
        #if os(iOS)
        .toolbarBackground(HausPlatformColor.groupedBackground, for: .navigationBar)
        #endif
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button {
                    Task { await saveIdentity() }
                } label: {
                    if isSaving {
                        ProgressView()
                    } else {
                        Text("Save")
                    }
                }
                .disabled(!hasIdentityChanges || isSaving)
                .accessibilityLabel("Save profile")
            }
        }
    }

    private var hasIdentityChanges: Bool {
        name.trimmingCharacters(in: .whitespacesAndNewlines) != savedName
            || ParticipantHandleValidation.normalized(handle) != savedHandle
    }

    private func saveIdentity() async {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedHandle = ParticipantHandleValidation.normalized(handle)
        guard !trimmedName.isEmpty, hasIdentityChanges, !isSaving else { return }
        if let validationError = ParticipantHandleValidation.error(for: normalizedHandle) {
            errorMessage = validationError
            return
        }

        isSaving = true
        errorMessage = nil
        do {
            let draft = SettingsPerson(
                id: person.id,
                displayName: trimmedName,
                handle: normalizedHandle,
                email: person.email,
                role: person.role,
                joined: person.joined,
                description: person.description,
                avatarURL: person.avatarURL,
                initials: person.initials
            )
            let saved = try await onSave(draft)
            name = saved.displayName
            savedName = saved.displayName
            handle = saved.handle ?? normalizedHandle
            savedHandle = saved.handle ?? normalizedHandle
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}

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
                        SettingsRow(title: "Name", icon: .account, showsDivider: true) {
                            TextField("Name", text: $name)
                                .font(.body)
                                .multilineTextAlignment(.trailing)
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

                SettingsSection("Details") {
                    SettingsListGroup {
                        ValueRow("Handle", value: "@\(agent.handle)", icon: .handle, showsDivider: false)
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

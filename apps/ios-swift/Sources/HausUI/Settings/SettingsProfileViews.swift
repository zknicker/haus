import SwiftUI

struct HumanProfileView: View {
    let person: SettingsPerson
    let onEditDescription: (String, String) -> Void
    let onSave: (SettingsPerson) async throws -> SettingsPerson
    let onSaveAvatar: @Sendable (AvatarImagePayload) async throws -> Void
    let onSaveTimezone: (String) async throws -> SettingsPerson
    @State private var name: String
    @State private var savedName: String
    @State private var handle: String
    @State private var savedHandle: String
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var timezone: String?
    @State private var isPickingTimezone = false

    init(
        person: SettingsPerson,
        onEditDescription: @escaping (String, String) -> Void,
        onSave: @escaping (SettingsPerson) async throws -> SettingsPerson = { $0 },
        onSaveAvatar: @escaping @Sendable (AvatarImagePayload) async throws -> Void = { _ in },
        onSaveTimezone: @escaping (String) async throws -> SettingsPerson = { _ in SettingsFixtures.viewer }
    ) {
        self.person = person
        self.onEditDescription = onEditDescription
        self.onSave = onSave
        self.onSaveAvatar = onSaveAvatar
        self.onSaveTimezone = onSaveTimezone
        _timezone = State(initialValue: person.timezone)
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
                        SettingsRow(title: "Name", icon: .account, showsDivider: true, layout: .stacksAtAccessibilitySizes) {
                            TextField("Name", text: $name)
                                .font(.body)
                                .settingsRowValueAlignment()
                                .hausWordsAutocapitalization()
                                .submitLabel(.done)
                                .onSubmit { Task { await saveIdentity() } }
                                .accessibilityLabel("Name")
                        }
                        SettingsRow(title: "Handle", icon: .handle, showsDivider: true, layout: .stacksAtAccessibilitySizes) {
                            TextField("handle", text: $handle)
                                .font(.body)
                                .settingsRowValueAlignment()
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

                TimezoneSection(timezone: timezone) { isPickingTimezone = true }

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
        .navigationDestination(isPresented: $isPickingTimezone) {
            TimezonePickerView(selection: timezone) { zone in
                Task { await saveTimezone(zone) }
            }
        }
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

    /// Shows the choice at once and settles on the Server's canonical name;
    /// a refused save puts the previous zone back.
    private func saveTimezone(_ zone: String) async {
        guard zone != timezone else { return }
        let previous = timezone
        timezone = zone
        errorMessage = nil
        do {
            timezone = try await onSaveTimezone(zone).timezone ?? zone
        } catch {
            timezone = previous
            errorMessage = error.localizedDescription
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
                initials: person.initials,
                timezone: person.timezone
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

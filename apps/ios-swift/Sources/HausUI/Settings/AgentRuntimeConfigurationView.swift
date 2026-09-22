import HausModels
import SwiftUI

struct AgentRuntimeConfigurationView: View {
    @Environment(\.dismiss) private var dismiss
    let configuration: SettingsAgentRuntimeConfiguration
    let onSave: (AgentRuntimeConfiguration) async throws -> SettingsAgent
    @State private var runtimeID: String
    @State private var modelID: String
    @State private var reasoningEffort: AgentReasoningEffort
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(
        configuration: SettingsAgentRuntimeConfiguration,
        onSave: @escaping (AgentRuntimeConfiguration) async throws -> SettingsAgent
    ) {
        self.configuration = configuration
        self.onSave = onSave
        _runtimeID = State(initialValue: configuration.desired.runtimeID)
        _modelID = State(initialValue: configuration.desired.modelID)
        _reasoningEffort = State(initialValue: configuration.desired.reasoningEffort)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SettingsSection("Execution") {
                    SettingsListGroup {
                        PickerRow(
                            "Runtime",
                            value: runtimeID,
                            icon: .terminal,
                            options: runtimeOptions,
                            onChange: selectRuntime
                        )
                        PickerRow(
                            "Model",
                            value: modelID,
                            icon: .agents,
                            options: modelOptions,
                            onChange: selectModel
                        )
                        if reasoningOptions.isEmpty {
                            ValueRow(
                                "Reasoning effort",
                                value: reasoningEffort.displayName,
                                icon: .settings,
                                showsDivider: false
                            )
                        } else {
                            PickerRow(
                                "Reasoning effort",
                                value: reasoningEffort,
                                icon: .settings,
                                options: reasoningOptions.map { ($0, $0.displayName) },
                                showsDivider: false,
                                onChange: { reasoningEffort = $0 }
                            )
                        }
                    }
                }

                Text(configurationDescription)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 16)

                if !isDraftAvailable {
                    Text(unavailableMessage)
                        .font(.footnote)
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 16)
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
        .navigationTitle("Runtime & model")
        .hausInlineNavigationTitle()
        #if os(iOS)
        .toolbarBackground(HausPlatformColor.groupedBackground, for: .navigationBar)
        #endif
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button {
                    Task { await save() }
                } label: {
                    if isSaving {
                        ProgressView()
                    } else {
                        Text("Save")
                    }
                }
                .disabled(!isDraftAvailable || isSaving)
                .accessibilityLabel("Save runtime configuration")
            }
        }
    }

    private var selectedRuntime: SettingsRuntime? {
        configuration.runtimes.first { $0.id == runtimeID }
    }

    private var selectedModel: SettingsRuntimeModel? {
        selectedRuntime?.models.first { $0.id == modelID }
    }

    private var runtimeOptions: [(String, String)] {
        var options = configuration.runtimes.map { ($0.id, $0.label) }
        if !options.contains(where: { $0.0 == runtimeID }) {
            options.insert((runtimeID, "\(settingsRuntimeDisplayName(runtimeID)) · Not installed"), at: 0)
        }
        return options
    }

    private var modelOptions: [(String, String)] {
        var options = selectedRuntime?.models.map { ($0.id, $0.label) } ?? []
        if !options.contains(where: { $0.0 == modelID }) {
            options.insert((modelID, "\(modelID) · Not installed"), at: 0)
        }
        return options
    }

    private var reasoningOptions: [AgentReasoningEffort] {
        selectedModel?.supportedReasoningEfforts ?? []
    }

    private var draft: AgentRuntimeConfiguration {
        AgentRuntimeConfiguration(
            modelID: modelID,
            reasoningEffort: reasoningEffort,
            runtimeID: runtimeID
        )
    }

    private var isDraftAvailable: Bool {
        configuration.canEdit && configuration.isAvailable(draft)
    }

    private var configurationDescription: String {
        if reasoningChangeResetsSession(runtimeID: runtimeID) {
            return "Changes apply on the next turn. Runtime or model changes start a fresh session; Grok Build also starts a fresh session when reasoning effort changes."
        }
        return "Changes apply on the next turn. Runtime or model changes start a fresh session; reasoning effort changes preserve conversation context."
    }

    private var unavailableMessage: String {
        if configuration.runtimes.isEmpty {
            return "The assigned Computer inventory is unavailable. Reconnect the Computer before saving."
        }
        return "This selection is not reported by the assigned Computer. Choose an installed runtime, model, and supported reasoning effort."
    }

    private func selectRuntime(_ nextRuntimeID: String) {
        runtimeID = nextRuntimeID
        guard let runtime = configuration.runtimes.first(where: { $0.id == nextRuntimeID }) else { return }
        modelID = runtime.models.first?.id ?? ""
        selectSupportedReasoningEffort()
    }

    private func selectModel(_ nextModelID: String) {
        modelID = nextModelID
        selectSupportedReasoningEffort()
    }

    private func selectSupportedReasoningEffort() {
        guard let model = selectedModel else { return }
        if !model.supportedReasoningEfforts.contains(reasoningEffort) {
            reasoningEffort = model.defaultEffort
        }
    }

    private func save() async {
        guard isDraftAvailable, !isSaving else { return }
        isSaving = true
        errorMessage = nil
        do {
            _ = try await onSave(draft)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}

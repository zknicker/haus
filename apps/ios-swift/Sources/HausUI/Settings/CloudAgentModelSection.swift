import SwiftUI
import HausModels

/// The Server-wide Cloud Agent model. Owners and Admins pick from Auto plus
/// the catalog Cursor reported, then the Effort and Fast the chosen model offers;
/// everyone else reads the current values. Every edit saves immediately.
struct CloudAgentModelSection: View {
    let canManage: Bool
    let actions: CloudAgentSettingsActions
    @State private var settings: CloudAgentSettings?
    /// The edit in flight, shown until the Server answers so controls never snap back.
    @State private var pending: CloudAgentModelSetting?
    @State private var saveTask: Task<Void, Never>?
    @State private var loadFailed = false
    @State private var saveFailure: String?

    var body: some View {
        if let settings {
            loaded(CloudAgentModelChoice(settings: displayed(settings)))
        } else if loadFailed {
            Section {
                Text("The model setting is unavailable.")
            } header: {
                Text("Model")
            }
        } else {
            // Blank while loading; the section appears with its value.
            Color.clear.frame(height: 0).listRowBackground(Color.clear)
                .task { await load() }
        }
    }

    private func loaded(_ choice: CloudAgentModelChoice) -> some View {
        Section {
            if choice.isEditable(canManage: canManage) {
                NavigationLink {
                    CloudAgentModelListView(choice: choice) { save($0) }
                } label: {
                    valueRow("Model", value: choice.value)
                }
            } else {
                // A manager without a catalog sees the row disabled at Auto.
                valueRow("Model", value: choice.value)
                    .disabled(canManage)
                    .foregroundStyle(canManage ? .secondary : .primary)
            }
            if let effort = choice.effort {
                if canManage {
                    effortPicker(effort, choice: choice)
                } else {
                    valueRow("Effort", value: effort.options.first { $0.value == effort.selection }?.name ?? "Default")
                }
            }
            if let fastIsOn = choice.fastIsOn {
                if canManage {
                    Toggle("Fast", isOn: Binding(
                        get: { fastIsOn },
                        set: { isOn in choice.setting(fast: isOn).map(save) }
                    ))
                } else {
                    valueRow("Fast", value: fastIsOn ? "On" : "Off")
                }
            }
        } footer: {
            if let saveFailure {
                Text(saveFailure).foregroundStyle(.red)
            } else {
                Text(choice.footer(canManage: canManage))
            }
        }
    }

    /// A menu for a short list; six or more options push a list instead.
    @ViewBuilder
    private func effortPicker(_ effort: CloudAgentModelChoice.EffortControl, choice: CloudAgentModelChoice) -> some View {
        let selection = Binding<String?>(
            get: { effort.selection },
            set: { value in choice.setting(effort: value).map(save) }
        )
        let picker = Picker("Effort", selection: selection) {
            ForEach(effort.options, id: \.self) { option in
                Text(option.name).tag(option.value)
            }
        }
        #if os(iOS)
        if effort.options.count > 5 {
            picker.pickerStyle(.navigationLink)
        } else {
            picker.pickerStyle(.menu)
        }
        #else
        picker.pickerStyle(.menu)
        #endif
    }

    private func valueRow(_ title: String, value: String) -> some View {
        SettingsValueLayout {
            Text(title)
        } value: {
            // Beside the title it stays one line; stacked, it wraps at words.
            Text(value)
                .foregroundStyle(.secondary)
                .settingsRowValueAlignment()
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func displayed(_ settings: CloudAgentSettings) -> CloudAgentSettings {
        guard let pending else { return settings }
        return CloudAgentSettings(model: pending, catalog: settings.catalog, savedModelUnavailable: false)
    }

    private func load() async {
        do {
            settings = try await actions.loadModel()
        } catch is CancellationError {
            return
        } catch {
            loadFailed = true
        }
    }

    /// Saves in order; a newer edit supersedes the older one's result on screen.
    private func save(_ model: CloudAgentModelSetting) {
        guard model != (pending ?? settings?.model) else { return }
        pending = model
        saveFailure = nil
        let previous = saveTask
        saveTask = Task {
            await previous?.value
            await commit(model)
        }
    }

    private func commit(_ model: CloudAgentModelSetting) async {
        do {
            let saved = try await actions.setModel(model)
            guard pending == model else { return }
            settings = saved
            pending = nil
        } catch {
            guard pending == model else { return }
            pending = nil
            saveFailure = "Could not change the model. Check your connection and try again."
            if let fresh = try? await actions.loadModel() { settings = fresh }
        }
    }
}

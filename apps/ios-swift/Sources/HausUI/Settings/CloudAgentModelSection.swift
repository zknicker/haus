import SwiftUI
import HausModels

/// The Server-wide Cloud Agent model. Owners and Admins pick from Cursor default plus
/// the catalog Cursor reported; everyone else reads the current value.
struct CloudAgentModelSection: View {
    let canManage: Bool
    let actions: CloudAgentSettingsActions
    @State private var settings: CloudAgentSettings?
    @State private var loadFailed = false
    @State private var saveFailure: String?
    @State private var isSaving = false

    var body: some View {
        if let settings {
            loaded(CloudAgentModelChoice(settings: settings))
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
                picker(choice)
            } else {
                // A manager without a catalog sees the row disabled at Cursor default.
                valueRow(choice.value)
                    .disabled(canManage)
                    .foregroundStyle(canManage ? .secondary : .primary)
            }
        } footer: {
            if let saveFailure {
                Text(saveFailure).foregroundStyle(.red)
            } else {
                Text(choice.footer(canManage: canManage))
            }
        }
    }

    /// A NavigationLink rather than a `Picker`: the stock picker label wraps
    /// a long value beside the title, where settings rows must stack it.
    private func picker(_ choice: CloudAgentModelChoice) -> some View {
        NavigationLink {
            CloudAgentModelOptionsView(choice: choice, selection: selection)
        } label: {
            valueRow(choice.value)
        }
        .disabled(isSaving)
    }

    private func valueRow(_ value: String) -> some View {
        SettingsValueLayout {
            Text("Model")
        } value: {
            // Beside the title it stays one line; stacked, it wraps at words.
            Text(value)
                .foregroundStyle(.secondary)
                .settingsRowValueAlignment()
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var selection: Binding<CloudAgentModelSetting> {
        Binding(
            get: { settings?.model ?? .auto },
            set: { model in Task { await save(model) } }
        )
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

    private func save(_ model: CloudAgentModelSetting) async {
        guard let current = settings, model != current.model, !isSaving else { return }
        isSaving = true
        saveFailure = nil
        defer { isSaving = false }
        do {
            settings = try await actions.setModel(model)
        } catch is CancellationError {
            return
        } catch {
            saveFailure = "Could not change the model. Check your connection and try again."
            settings = try? await actions.loadModel()
        }
    }
}

private struct CloudAgentModelOptionsView: View {
    let choice: CloudAgentModelChoice
    let selection: Binding<CloudAgentModelSetting>
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section {
                ForEach(choice.options) { option in
                    row(option.setting, name: option.name, detail: option.detail)
                }
            }
            if let unavailableModelID = choice.unavailableModelID {
                Section {
                    row(.model(id: unavailableModelID), name: unavailableModelID, detail: nil)
                } header: {
                    Text("Unavailable")
                } footer: {
                    Text("Cursor no longer lists this model, so runs use Cursor default.")
                }
            }
        }
        .navigationTitle("Model")
        .hausInlineNavigationTitle()
    }

    private func row(_ setting: CloudAgentModelSetting, name: String, detail: String?) -> some View {
        let isSelected = selection.wrappedValue == setting
        return Button {
            selection.wrappedValue = setting
            dismiss()
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    // Explicit colors: a Form button tints hierarchical styles.
                    Text(name).foregroundStyle(Color.primary)
                    if let detail {
                        Text(detail).font(.subheadline).foregroundStyle(Color.secondary)
                    }
                }
                Spacer(minLength: 8)
                if isSelected {
                    Image(systemName: "checkmark").fontWeight(.semibold).foregroundStyle(.tint)
                }
            }
            .contentShape(Rectangle())
        }
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}


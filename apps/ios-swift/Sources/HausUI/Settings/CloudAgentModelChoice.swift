import Foundation
import HausModels

/// What the Cloud agents Model row shows for one `cloudAgentSettings.get`
/// read: the options, the row's value, and the section footer.
public struct CloudAgentModelChoice: Equatable, Sendable {
    public struct Option: Identifiable, Hashable, Sendable {
        public let setting: CloudAgentModelSetting
        public let name: String
        public let detail: String?

        public var id: CloudAgentModelSetting { setting }
    }

    /// Haus sends no model, so Cursor resolves the account's configured default.
    static let cursorDefaultName = "Cursor default"
    static let cursorDefaultDetail = "Uses your Cursor account's default model (Auto unless you've changed it)"

    public let settings: CloudAgentSettings

    public init(settings: CloudAgentSettings) {
        self.settings = settings
    }

    /// Cursor default first, then Cursor's catalog in its own order.
    public var options: [Option] {
        let auto = Option(setting: .auto, name: Self.cursorDefaultName, detail: Self.cursorDefaultDetail)
        let models = (settings.catalog?.models ?? []).map {
            Option(setting: .model(id: $0.id), name: $0.displayName, detail: $0.description)
        }
        return [auto] + models
    }

    /// The saved model id when the catalog no longer lists it.
    public var unavailableModelID: String? {
        settings.savedModelUnavailable ? settings.model.modelID : nil
    }

    public var value: String {
        if unavailableModelID != nil { return "Unavailable" }
        guard let id = settings.model.modelID else { return Self.cursorDefaultName }
        return settings.catalog?.models.first { $0.id == id }?.displayName ?? id
    }

    /// Without a catalog only Cursor default exists, so the picker opens only to clear a
    /// saved model that is no longer available.
    public func isEditable(canManage: Bool) -> Bool {
        canManage && (settings.catalog != nil || settings.model != .auto)
    }

    public func footer(canManage: Bool, now: Date = Date()) -> String {
        var sentences: [String] = []
        if let unavailableModelID {
            sentences.append("The saved model, \(unavailableModelID), isn't available, so runs use Cursor default until an available model is picked.")
        } else if settings.model == .auto {
            sentences.append("\(Self.cursorDefaultDetail).")
        } else {
            sentences.append("New cloud agent runs use this model.")
        }
        if let catalog = settings.catalog {
            let formatter = RelativeDateTimeFormatter()
            formatter.unitsStyle = .full
            let age = formatter.localizedString(for: min(catalog.refreshedAt, now), relativeTo: now)
            sentences.append("Model list updated \(age).")
        } else {
            sentences.append("The model list appears once a Computer connected to Cursor reports it.")
        }
        if !canManage {
            sentences.append("Only an owner or admin can change the model.")
        }
        return sentences.joined(separator: " ")
    }
}

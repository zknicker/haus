import Foundation
import HausModels

/// What Settings → Cloud agents shows for one `cloudAgentSettings.get` read:
/// the model list, the Model row's value, the Effort and Fast controls the
/// chosen model offers, the settings each edit saves, and the footer.
public struct CloudAgentModelChoice: Equatable, Sendable {
    public struct Option: Identifiable, Hashable, Sendable {
        public let setting: CloudAgentModelSetting
        public let name: String
        public let detail: String?

        /// Params never distinguish list rows: a row selects a model.
        public var id: String { setting.modelID ?? "" }
    }

    public struct OptionSection: Identifiable, Hashable, Sendable {
        /// Nil for the leading Cursor default section.
        public let title: String?
        public let options: [Option]

        public var id: String { title ?? "" }
    }

    /// One Effort choice; a nil value leaves the param unset (the model's default).
    public struct EffortOption: Hashable, Sendable {
        public let value: String?
        public let name: String
    }

    public struct EffortControl: Equatable, Sendable {
        public let options: [EffortOption]
        public let selection: String?
    }

    /// Haus sends no model, so Cursor resolves the account's configured default.
    static let cursorDefaultName = "Cursor default"
    static let cursorDefaultDetail = "Uses your Cursor account's default model (Auto unless you've changed it)"
    /// List sections in display order; GLM, Kimi, and unknown families share Other.
    static let familySections: [(title: String, families: Set<CloudAgentModelFamily>)] = [
        ("Claude", [.claude]),
        ("GPT", [.gpt]),
        ("Gemini", [.gemini]),
        ("Grok", [.grok]),
        ("Composer", [.composer]),
        ("Other", [.glm, .kimi, .other]),
    ]

    public let settings: CloudAgentSettings

    public init(settings: CloudAgentSettings) {
        self.settings = settings
    }

    // MARK: Model list

    /// Cursor default alone first, then one section per family in Cursor's order.
    /// A query matches a model's name or id, ignoring case and diacritics.
    public func sections(matching query: String = "") -> [OptionSection] {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let matches = { (text: String) in
            query.isEmpty || text.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) != nil
        }
        var sections: [OptionSection] = []
        if matches(Self.cursorDefaultName) {
            let auto = Option(setting: .auto, name: Self.cursorDefaultName, detail: Self.cursorDefaultDetail)
            sections.append(OptionSection(title: nil, options: [auto]))
        }
        let models = (settings.catalog?.models ?? [])
            .filter { matches($0.displayName) || matches($0.id) }
            .sorted { $0.order < $1.order }
        for family in Self.familySections {
            let options = models.filter { family.families.contains($0.family) }.map {
                Option(setting: .model(id: $0.id, params: .modelDefaults), name: $0.displayName, detail: $0.description)
            }
            if !options.isEmpty { sections.append(OptionSection(title: family.title, options: options)) }
        }
        return sections
    }

    public func isSelected(_ option: Option) -> Bool {
        option.setting.modelID == settings.model.modelID
    }

    /// The setting a list row saves: a model change resets params to the model's
    /// defaults, and the already-chosen row (an unavailable saved model included)
    /// saves nothing, so it never resends an id the Server would refuse.
    public func setting(selecting option: Option) -> CloudAgentModelSetting? {
        isSelected(option) ? nil : option.setting
    }

    // MARK: Model row

    /// The saved model id when the catalog no longer lists it.
    public var unavailableModelID: String? {
        settings.savedModelUnavailable ? settings.model.modelID : nil
    }

    /// The saved model as the catalog lists it.
    public var selectedModel: CloudAgentModel? {
        guard unavailableModelID == nil, let id = settings.model.modelID else { return nil }
        return settings.catalog?.models.first { $0.id == id }
    }

    public var value: String {
        if unavailableModelID != nil { return "Unavailable" }
        guard let id = settings.model.modelID else { return Self.cursorDefaultName }
        return selectedModel?.displayName ?? id
    }

    /// Without a catalog only Cursor default exists, so the list opens only to clear a
    /// saved model that is no longer available.
    public func isEditable(canManage: Bool) -> Bool {
        canManage && (settings.catalog != nil || settings.model != .auto)
    }

    // MARK: Effort and Fast

    /// Shown only when the chosen model offers effort. A saved value the model no
    /// longer offers reads as the default, which is what runs use.
    public var effort: EffortControl? {
        guard let effort = selectedModel?.effort else { return nil }
        var options = effort.options.map { EffortOption(value: $0.value, name: $0.displayName) }
        if effort.defaultValue == nil { options.insert(EffortOption(value: nil, name: "Default"), at: 0) }
        return EffortControl(options: options, selection: offeredParams.effort ?? effort.defaultValue)
    }

    /// Shown only when the chosen model offers Fast; nil otherwise.
    public var fastIsOn: Bool? {
        guard let fast = selectedModel?.fast else { return nil }
        return offeredParams.fast ?? fast.defaultValue
    }

    /// Saved params the chosen model no longer offers; runs use its default for them.
    public var droppedParamNames: [String] {
        let saved = settings.model.params
        let offered = offeredParams
        var names: [String] = []
        if saved.effort != nil, offered.effort == nil { names.append("effort") }
        if saved.fast != nil, offered.fast == nil { names.append("Fast") }
        return selectedModel == nil ? [] : names
    }

    /// Picking the model's default leaves the param unset, so it keeps following Cursor.
    public func setting(effort value: String?) -> CloudAgentModelSetting? {
        guard let model = selectedModel, let effort = model.effort else { return nil }
        var params = offeredParams
        params.effort = value == effort.defaultValue ? nil : value
        return .model(id: model.id, params: params)
    }

    public func setting(fast isOn: Bool) -> CloudAgentModelSetting? {
        guard let model = selectedModel, let fast = model.fast else { return nil }
        var params = offeredParams
        params.fast = isOn == fast.defaultValue ? nil : isOn
        return .model(id: model.id, params: params)
    }

    // MARK: Footer

    public func footer(canManage: Bool, now: Date = Date()) -> String {
        var sentences: [String] = []
        if let unavailableModelID {
            sentences.append("The saved model, \(unavailableModelID), isn't available, so runs use Cursor default until an available model is picked.")
        } else if settings.model == .auto {
            sentences.append("\(Self.cursorDefaultDetail).")
        } else {
            sentences.append("New cloud agent runs use this model.")
            if !droppedParamNames.isEmpty {
                let names = droppedParamNames.joined(separator: " and ")
                let plural = droppedParamNames.count > 1
                sentences.append("The saved \(names) \(plural ? "settings aren't" : "setting isn't") offered anymore, so runs use the model's default.")
            }
        }
        if let catalog = settings.catalog {
            // A Computer clock ahead of this device reads as just now, never "in 0 seconds".
            if now.timeIntervalSince(catalog.refreshedAt) < 60 {
                sentences.append("Model list updated just now.")
            } else {
                let formatter = RelativeDateTimeFormatter()
                formatter.unitsStyle = .full
                sentences.append("Model list updated \(formatter.localizedString(for: catalog.refreshedAt, relativeTo: now)).")
            }
        } else {
            sentences.append("The model list appears once a Computer connected to Cursor reports it.")
        }
        if !canManage {
            sentences.append("Only an owner or admin can change the model.")
        }
        return sentences.joined(separator: " ")
    }

    /// The saved params the chosen model still offers, so an edit never resends
    /// a value the Server would refuse.
    private var offeredParams: CloudAgentModelParams {
        guard let model = selectedModel else { return .modelDefaults }
        let saved = settings.model.params
        let effort = saved.effort.flatMap { value in
            model.effort?.options.contains { $0.value == value } == true ? value : nil
        }
        let fast = model.fast == nil ? nil : saved.fast
        return CloudAgentModelParams(effort: effort, fast: fast)
    }
}

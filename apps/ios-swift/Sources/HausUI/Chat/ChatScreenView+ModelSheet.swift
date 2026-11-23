import HausModels

/// Builds a Captain DM's Model sheet from the Server's model connections and the runners' model
/// catalog: one group per provider, under that provider's default connection, holding every
/// runner model the provider serves.
public enum CaptainModelSheet {
    public static func presentation(
        captainName: String,
        current: AgentRuntimeConfiguration?,
        connections: [ModelConnection],
        runtimes: [ComputerRuntimeSummary],
        canConfigure: Bool
    ) -> ModelSheetPresentation {
        let groups = representatives(connections).compactMap { connection in
            let options = runtimes.flatMap { runtime in
                runtime.models
                    .filter { provider(forModelID: $0.id) == connection.provider }
                    .map { ModelSheetOption(runtimeID: runtime.id, model: SettingsRuntimeModel($0)) }
            }
            return options.isEmpty ? nil : ModelSheetGroup(connection: connection, options: options)
        }
        return ModelSheetPresentation(
            captainName: captainName,
            current: current,
            groups: groups,
            access: canConfigure ? .configurable : .viewerCannotConfigure
        )
    }

    /// Which provider serves a model id. Ported from `modelProviderFor` in
    /// `packages/haus-api/src/model-connections.ts`.
    public static func provider(forModelID modelID: String) -> ModelProvider {
        if modelID.contains("/") { return .openrouter }
        if modelID.hasPrefix("claude-") { return .claude }
        if modelID.hasPrefix("grok-") { return .xai }
        if modelID.hasPrefix("gemini-") { return .gemini }
        return .chatgpt
    }

    /// Each provider's default enabled connection, else its first, in connection order.
    private static func representatives(_ connections: [ModelConnection]) -> [ModelConnection] {
        let enabled = connections.filter(\.enabled).sorted { $0.position < $1.position }
        var seen: Set<ModelProvider> = []
        let defaults = enabled.filter(\.isDefault) + enabled.filter { !$0.isDefault }
        let chosen = defaults.filter { seen.insert($0.provider).inserted }
        return enabled.filter { connection in chosen.contains { $0.id == connection.id } }
    }
}

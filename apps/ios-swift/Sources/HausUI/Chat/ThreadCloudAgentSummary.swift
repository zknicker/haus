import Foundation

/// The Thread preview states the work inside a Thread once per provider: one
/// work keeps its own row, and a fan-out collapses to a count and a status
/// breakdown so the preview stays at a glance however many Runs an Agent
/// starts. Mirrors the App's `summarizeThreadCloudAgentWork`.
public struct ThreadCloudAgentSummary: Identifiable, Hashable, Sendable {
    public enum Content: Hashable, Sendable {
        case single(CloudAgentPresentation)
        case group(count: Int, statuses: [StatusCount])
    }

    public struct StatusCount: Hashable, Sendable {
        public let status: CloudAgentPresentationStatus
        public let count: Int
    }

    public let provider: String
    public let content: Content
    public var id: String { provider }
    public var providerName: String { CloudAgentPresentation.providerName(provider) }

    /// Providers keep first-seen order; live states lead each breakdown.
    public static func summarize(_ agents: [CloudAgentPresentation]) -> [ThreadCloudAgentSummary] {
        var order: [String] = []
        var byProvider: [String: [CloudAgentPresentation]] = [:]
        for agent in agents {
            if byProvider[agent.work.provider] == nil { order.append(agent.work.provider) }
            byProvider[agent.work.provider, default: []].append(agent)
        }
        return order.map { provider in
            let group = byProvider[provider] ?? []
            if group.count == 1, let only = group.first {
                return ThreadCloudAgentSummary(provider: provider, content: .single(only))
            }
            return ThreadCloudAgentSummary(
                provider: provider, content: .group(count: group.count, statuses: statusCounts(group))
            )
        }
    }

    /// "Cursor · Running" for one work; "Cursor · 9 agents · 7 running · 1 done" for a fan-out.
    public var headline: String {
        switch content {
        case let .single(agent): "\(providerName) · \(agent.statusLabel)"
        case let .group(count, _): "\(providerName) · \(count) agents · \(breakdown)"
        }
    }

    /// A fan-out headline for a narrow row: the breakdown already sums to the
    /// count, so the count gives way before any status is truncated.
    public var compactHeadline: String? {
        guard case .group = content else { return nil }
        return "\(providerName) · \(breakdown)"
    }

    /// The single work's title or diff; a fan-out says everything in its headline.
    public var detail: String? {
        if case let .single(agent) = content { return agent.compactDescription }
        return nil
    }

    public var accessibilityText: String {
        switch content {
        case let .single(agent):
            [providerName, agent.work.title, agent.statusLabel,
             agent.compactDescription == agent.work.title ? nil : agent.compactDescription]
                .compactMap { $0 }.joined(separator: ", ")
        case let .group(count, statuses):
            "\(providerName), \(count) agents: "
                + statuses.map { "\($0.count) \($0.status.label.lowercased())" }.joined(separator: ", ")
        }
    }

    /// "7 running · 1 done · 1 failed"
    private var breakdown: String {
        guard case let .group(_, statuses) = content else { return "" }
        return statuses.map { "\($0.count) \($0.status.label.lowercased())" }.joined(separator: " · ")
    }

    private static func statusCounts(_ agents: [CloudAgentPresentation]) -> [StatusCount] {
        var counts: [CloudAgentPresentationStatus: Int] = [:]
        for agent in agents { counts[agent.status, default: 0] += 1 }
        return CloudAgentPresentationStatus.allCases.compactMap { status in
            counts[status].map { StatusCount(status: status, count: $0) }
        }
    }
}

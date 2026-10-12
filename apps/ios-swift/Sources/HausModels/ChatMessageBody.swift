import Foundation

public enum ChatMessageBody: Codable, Sendable, Equatable {
    case text
    case agentCreated(CreatedAgentSummary)
    case unsupported(String)

    private enum CodingKeys: String, CodingKey { case agent, kind }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(String.self, forKey: .kind)
        switch kind {
        case "text": self = .text
        case "agent-created":
            self = .agentCreated(try container.decode(CreatedAgentSummary.self, forKey: .agent))
        default: self = .unsupported(kind)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .text: try container.encode("text", forKey: .kind)
        case .agentCreated(let agent):
            try container.encode("agent-created", forKey: .kind)
            try container.encode(agent, forKey: .agent)
        case .unsupported(let kind): try container.encode(kind, forKey: .kind)
        }
    }
}

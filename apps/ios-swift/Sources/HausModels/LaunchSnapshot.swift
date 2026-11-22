import Foundation

/// The last Server state this device rendered, kept on disk so a cold launch
/// paints immediately while the live load runs. It is a cache, never a source
/// of truth: the live load replaces every field it carries.
///
/// Scoped to one signed-in user and one Server: each Server keeps its own file
/// (`LaunchSnapshotStore`), and a cold launch paints only the active Server's.
public struct LaunchSnapshot: Codable, Sendable, Equatable {
    /// Bump whenever a carried model's encoding changes shape. Version 4 keys
    /// the snapshot by Server and carries the Worker `status` decode.
    public static let currentVersion = 4
    /// Pages beyond this many messages are not worth a cold-launch paint.
    public static let maximumPageMessages = 200
    public static let maximumPages = 3

    public let version: Int
    public let appProtocolVersion: Int
    public let userID: String
    /// The Server this snapshot paints. `servers` is the viewer's whole list.
    public let serverID: String
    public let servers: [ServerSummary]
    public let chats: [ChatSummary]
    public let agents: [AgentSummary]
    public let members: MemberList?
    public let pagesByChatID: [String: ChatMessagePage]

    public init(
        appProtocolVersion: Int,
        userID: String,
        serverID: String,
        servers: [ServerSummary],
        chats: [ChatSummary],
        agents: [AgentSummary],
        members: MemberList?,
        pagesByChatID: [String: ChatMessagePage]
    ) {
        version = Self.currentVersion
        self.appProtocolVersion = appProtocolVersion
        self.userID = userID
        self.serverID = serverID
        self.servers = servers
        self.chats = chats
        self.agents = agents
        self.members = members
        self.pagesByChatID = pagesByChatID
    }

    /// The pages worth carrying: the given Chats in priority order, skipping
    /// any that is missing, scrolled away from the latest messages, or large.
    public static func pages(
        _ pages: [String: ChatMessagePage],
        priority chatIDs: [String]
    ) -> [String: ChatMessagePage] {
        var kept: [String: ChatMessagePage] = [:]
        for chatID in chatIDs where kept[chatID] == nil {
            guard kept.count < maximumPages else { break }
            guard let page = pages[chatID],
                  page.nextAfterSequence == nil,
                  page.messages.count <= maximumPageMessages
            else { continue }
            kept[chatID] = page
        }
        return kept
    }
}

import Foundation
import HausModels
import HausTransport
import HausUI

/// Reading an artifact page from the authoring Agent's workspace — the same
/// `agent.workspaceFile` read the App's artifact pane uses. The Server relays
/// it to the Agent's Computer, so an offline Computer is the common failure —
/// unless the phone itself has lost the Server, which the sheet says instead.
extension HausStore {
    func readArtifactPage(agentID: String, path: String) async throws -> ArtifactPageFile {
        guard let serverID = activeServer?.id else { throw ArtifactPageUnavailable.failed }
        let file: WorkspaceFileContent
        do {
            file = try await readWorkspaceFile(agentID: agentID, path: path, serverID: serverID)
        } catch ArtifactPageUnavailable.computerUnreachable where !isConnected {
            // A relay failure while the live streams are down is this phone's
            // outage, not the Computer's.
            throw ArtifactPageUnavailable.offline
        }
        guard !file.binary, file.encoding == "utf8", file.mediaType.hasPrefix("text/html") else {
            throw ArtifactPageUnavailable.notAPage
        }
        return ArtifactPageFile(html: file.content, truncated: file.truncated)
    }

    private func readWorkspaceFile(agentID: String, path: String, serverID: String) async throws -> WorkspaceFileContent {
        do {
            return try await client.query(
                "agent.workspaceFile",
                input: WorkspaceFileInput(agentId: agentID, includeHidden: false, path: path, serverId: serverID)
            )
        } catch let error as TRPCError {
            switch error.domainCode {
            case "FORBIDDEN": throw ArtifactPageUnavailable.forbidden
            // The Server reports every failed relay to the Computer this way.
            case "SERVICE_UNAVAILABLE", nil: throw ArtifactPageUnavailable.computerUnreachable
            default: throw ArtifactPageUnavailable.failed
            }
        } catch let error as TRPCClientError where error.isNoConnection {
            // The request never reached the Server, so the Computer was not asked.
            throw ArtifactPageUnavailable.offline
        } catch let error as TRPCClientError where !isConnected && error.isTransport {
            // A timeout or dropped exchange while the live streams are down is
            // this phone's outage too.
            Self.logger.error("Reading an artifact page failed: \(error.localizedDescription, privacy: .public)")
            throw ArtifactPageUnavailable.offline
        } catch {
            Self.logger.error("Reading an artifact page failed: \(error.localizedDescription, privacy: .public)")
            throw ArtifactPageUnavailable.failed
        }
    }
}

struct WorkspaceFileInput: Encodable, Sendable {
    let agentId: String
    let includeHidden: Bool
    let path: String
    let serverId: String
}

/// The fields of `workspaceFileContentSchema` a page needs.
struct WorkspaceFileContent: Decodable, Sendable {
    let binary: Bool
    let content: String
    let encoding: String
    let mediaType: String
    let truncated: Bool
}

import Foundation
import HausModels
import HausTransport
import HausUI

/// Reading an artifact page from the authoring Agent's workspace — the same
/// `agent.workspaceFile` read the App's artifact pane uses. The Server relays
/// it to the Agent's Computer, so an offline Computer is the common failure.
extension HausStore {
    func readArtifactPage(agentID: String, path: String) async throws -> ArtifactPageFile {
        guard let serverID = activeServer?.id else { throw ArtifactPageUnavailable.failed }
        let file: WorkspaceFileContent
        do {
            file = try await client.query(
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
        } catch is URLError {
            throw ArtifactPageUnavailable.computerUnreachable
        } catch {
            Self.logger.error("Reading an artifact page failed: \(error.localizedDescription, privacy: .public)")
            throw ArtifactPageUnavailable.failed
        }
        guard !file.binary, file.encoding == "utf8", file.mediaType.hasPrefix("text/html") else {
            throw ArtifactPageUnavailable.notAPage
        }
        return ArtifactPageFile(html: file.content, truncated: file.truncated)
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

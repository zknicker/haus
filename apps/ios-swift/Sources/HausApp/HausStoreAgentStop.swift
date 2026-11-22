import Foundation
import HausModels
import HausUI

/// Stop on the Captain (the App's `useAgentStop`), for the DM header, the
/// profile, and the Home tiles. Only Owners and Admins may stop a Captain.
extension HausStore {
    var captainStopControl: CaptainStopControl {
        CaptainStopControl(
            phase: { [weak self] agentID in
                guard let self, let agent = agentsByID[agentID] else { return nil }
                return captains.stopPhase(for: agent, canStop: canManageServer)
            },
            stop: { [weak self] agentID in
                guard let self, let serverID = activeServer?.id else { throw HausStoreError.serverUnavailable }
                try await captains.stop(agentID: agentID)
                await captains.reloadAvailability(serverID: serverID)
            }
        )
    }
}

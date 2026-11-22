import Foundation
import HausAppModel
import HausModels
import HausTransport
import HausUI

/// Turn details and the Captain model chip, carried on `chatEngagementSource`.
///
/// Live runs come from `CaptainsModel`, which the Server-wide `agent.onActivity` stream already
/// feeds, so the sheet opens no second activity stream. Settled turns, outlines, and the journal
/// are read when the sheet opens; `agent.onExecutionJournal` is held only while it stays open.
extension HausStore {
    var turnDetailsSource: TurnDetailsSource {
        TurnDetailsSource(
            liveRun: { [weak self] agentID in
                guard let run = self?.captains.liveRunsByAgentID[agentID] else { return nil }
                return TurnLiveRun(agentID: run.agentID, runID: run.runID, startedAt: run.startedAt, events: run.events)
            },
            connect: { [weak self] request, content in
                await self?.connectTurnDetails(request, content: content)
            }
        )
    }

    var captainModelSource: CaptainModelSource {
        CaptainModelSource(
            presentation: { [weak self] agentID in
                guard let self, let agent = agentsByID[agentID] else { return nil }
                return CaptainModelSheet.presentation(
                    captainName: agent.displayName,
                    current: AgentRuntimeConfiguration(
                        modelID: agent.desiredModelID,
                        reasoningEffort: agent.desiredReasoningEffort ?? .medium,
                        runtimeID: agent.desiredRuntimeID
                    ),
                    connections: modelConnections?.connections ?? [],
                    runtimes: modelConnections?.runtimeCatalog ?? [],
                    canConfigure: canManageServer
                )
            },
            configure: { [weak self] agentID, configuration in
                try await self?.configureCaptainModel(agentID: agentID, configuration: configuration)
            }
        )
    }

    private func connectTurnDetails(_ request: TurnDetailsRequest, content: TurnDetailsContent) async {
        content.showsExecutionEvidence = canManageServer
        await withTaskGroup(of: Void.self) { group in
            for agentID in request.agentIDs {
                let liveRunID = request.liveRunIDs[agentID]
                group.addTask { await self.loadTurnDetails(agentID: agentID, liveRunID: liveRunID, content: content) }
                if let liveRunID, content.showsExecutionEvidence {
                    group.addTask { await self.followJournal(agentID: agentID, runID: liveRunID, content: content) }
                }
            }
        }
    }

    private func loadTurnDetails(agentID: String, liveRunID: String?, content: TurnDetailsContent) async {
        do {
            if let liveRunID {
                try await captains.loadLiveRunHistory(agentID: agentID, runID: liveRunID)
            }
            let turns = try await captains.turns(agentID: agentID)
            content.setTurns(turns, for: agentID)
            guard content.showsExecutionEvidence else { return }
            let runIDs = (liveRunID.map { [$0] } ?? []) + turns.map(\.runID)
            if !runIDs.isEmpty {
                content.setOutlines(try await captains.executionOutlines(agentID: agentID, runIDs: runIDs))
            }
            if let liveRunID {
                content.setJournal(try await captains.executionJournal(agentID: agentID, runID: liveRunID))
            }
        } catch is CancellationError {
            return
        } catch let error where CaptainsModel.isEvidenceRefusal(error) {
            content.showsExecutionEvidence = false
        } catch {
            Self.logger.warning("Turn details read failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Re-reads the live run's journal each time `agent.onExecutionJournal` says it changed.
    private func followJournal(agentID: String, runID: String, content: TurnDetailsContent) async {
        do {
            for try await _ in try captains.executionJournalChanges(agentID: agentID, runID: runID) {
                content.setJournal(try await captains.executionJournal(agentID: agentID, runID: runID))
            }
        } catch is CancellationError {
            return
        } catch let error where CaptainsModel.isEvidenceRefusal(error) {
            content.showsExecutionEvidence = false
        } catch {
            Self.logger.warning("agent.onExecutionJournal stopped: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// `agent.configure`, which rotates the Captain's session. A Server refusal comes back as
    /// `CaptainModelRefusal`, which turns the chip read-only.
    private func configureCaptainModel(agentID: String, configuration: AgentRuntimeConfiguration) async throws {
        guard let serverID = activeServer?.id else { throw CaptainModelRefusal(reason: nil) }
        do {
            let updated: AgentSummary = try await client.mutation(
                "agent.configure",
                input: ConfigureAgentInput(
                    agentID: agentID,
                    modelID: configuration.modelID,
                    reasoningEffort: configuration.reasoningEffort,
                    runtimeID: configuration.runtimeID,
                    serverID: serverID
                )
            )
            guard activeServer?.id == serverID else { return }
            agents = agents.map { $0.id == updated.id ? updated : $0 }
        } catch let error as TRPCError {
            throw CaptainModelRefusal(reason: error.message)
        }
    }
}

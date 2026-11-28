import HausModels
import SwiftUI

/// The Task's turn details in place: its live run and steps, then its settled
/// turns, from the same reads as the turn details sheet. A turn or step opens
/// that sheet. Blank while the reads load.
struct TaskPaneActivity: View {
    let agentID: String?

    @Environment(\.chatEngagementSource) private var engagementSource
    @State private var content = TurnDetailsContent()
    @State private var opened: TurnDetailsFocus?

    var body: some View {
        if let agentID, let source = engagementSource?.turnDetails {
            let liveRun = source.liveRun(agentID)
            let request = TurnDetailsRequest(
                agentIDs: [agentID],
                liveRunIDs: liveRun.map { [agentID: $0.runID] } ?? [:]
            )
            TurnDetailsCaptainSection(
                typist: nil,
                showsName: false,
                liveRun: liveRun,
                thought: nil,
                content: content,
                turns: content.turnsByAgentID[agentID],
                onOpen: { route in opened = TurnDetailsFocus(agentIDs: [agentID], messageDate: Self.date(route, content)) }
            )
            .frame(maxWidth: .infinity, alignment: .leading)
            .task(id: request) { await source.connect(request, content) }
            .sheet(item: $opened) { focus in
                TurnDetailsSheet(focus: focus, source: source, typist: { _ in nil }, thought: { _ in nil })
            }
        } else {
            TaskPaneEmpty(text: "No activity yet.")
        }
    }

    /// A settled turn opens on itself; a live step opens the sheet at its top.
    private static func date(_ route: TurnDetailsRoute, _ content: TurnDetailsContent) -> Date? {
        guard case .turn(let agentID, let runID) = route else { return nil }
        return content.turnsByAgentID[agentID]?.first { $0.runID == runID }?.startedAt
    }
}

/// The files the Task wrote, newest first. Blank while they load.
struct TaskPaneFiles: View {
    let files: [DriveFilePresentation]?
    let open: (DriveFilePresentation) -> Void

    var body: some View {
        if let files {
            if files.isEmpty {
                TaskPaneEmpty(text: "No files yet.")
            } else {
                TimelineView(.periodic(from: .now, by: 60)) { context in
                    LazyVStack(alignment: .leading, spacing: 0) {
                        DriveFileRows(files: files, now: context.date, onOpen: open)
                    }
                }
            }
        }
    }
}

private struct TaskPaneEmpty: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(HausPlatformColor.mutedInk)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

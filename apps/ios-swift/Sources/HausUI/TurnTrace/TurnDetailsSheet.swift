import HausModels
import SwiftUI

/// What opened turn details: the Captains to show, and for a message's "View turn details" the
/// message's time, which opens the turn it belongs to.
public struct TurnDetailsFocus: Identifiable, Hashable, Sendable {
    public let agentIDs: [String]
    public let messageDate: Date?

    public init(agentIDs: [String], messageDate: Date? = nil) {
        self.agentIDs = agentIDs
        self.messageDate = messageDate
    }

    public var id: Self { self }
}

/// Turn details (`specs/ios-app.md`, "Live work and turn details"): each Captain's live run with
/// its ticking clock and steps, then its settled turns. Owners and Admins also see journal steps
/// and outlines, read only while the sheet is open.
struct TurnDetailsSheet: View {
    let focus: TurnDetailsFocus
    let source: TurnDetailsSource
    let typist: (String) -> ChatTypist?
    let thought: (String) -> String?

    @State private var content = TurnDetailsContent()
    @State private var path: [TurnDetailsRoute] = []
    @State private var openedFocus = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let liveRuns = focus.agentIDs.compactMap { source.liveRun($0) }
        let request = TurnDetailsRequest(
            agentIDs: focus.agentIDs,
            liveRunIDs: Dictionary(liveRuns.map { ($0.agentID, $0.runID) }, uniquingKeysWith: { first, _ in first })
        )
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    ForEach(focus.agentIDs, id: \.self) { agentID in
                        TurnDetailsCaptainSection(
                            typist: typist(agentID),
                            showsName: focus.agentIDs.count > 1,
                            liveRun: liveRuns.first { $0.agentID == agentID },
                            thought: thought(agentID),
                            content: content,
                            turns: content.turnsByAgentID[agentID],
                            onOpen: { path.append($0) }
                        )
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 24)
            }
            .scrollBounceBehavior(.basedOnSize)
            .navigationTitle("Turn details")
            .hausInlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", systemImage: "xmark") { dismiss() }
                }
            }
            .navigationDestination(for: TurnDetailsRoute.self) { route in
                destination(route)
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task(id: request) { await source.connect(request, content) }
        .onChange(of: focusedTurn, initial: true) { _, turn in
            guard !openedFocus, let turn else { return }
            openedFocus = true
            path = [.turn(agentID: turn.agentID, runID: turn.runID)]
        }
    }

    /// The settled turn a message's "View turn details" asked for, once turns load.
    private var focusedTurn: AgentTurn? {
        guard let date = focus.messageDate else { return nil }
        let turns = focus.agentIDs.flatMap { content.turnsByAgentID[$0] ?? [] }
        return TurnDetailsCopy.turn(for: date, in: turns)
    }

    @ViewBuilder
    private func destination(_ route: TurnDetailsRoute) -> some View {
        switch route {
        case .turn(let agentID, let runID):
            if let turn = content.turnsByAgentID[agentID]?.first(where: { $0.runID == runID }) {
                TurnDetailsTurnView(
                    turn: turn,
                    outline: content.showsExecutionEvidence ? content.outlinesByRunID[runID] : nil,
                    onOpen: { path.append($0) }
                )
            }
        case .step(let detail):
            TurnStepDetailView(detail: detail)
        }
    }
}

enum TurnDetailsRoute: Hashable {
    case turn(agentID: String, runID: String)
    case step(TurnStepDetail)
}


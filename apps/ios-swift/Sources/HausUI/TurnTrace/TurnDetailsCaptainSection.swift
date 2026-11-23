import HausModels
import SwiftUI

/// One Captain in turn details: its live run, when it is working, then its Earlier card. Blank
/// until the Captain's turns load; nothing at all when it has neither a live run nor a turn.
struct TurnDetailsCaptainSection: View {
    let typist: ChatTypist?
    let showsName: Bool
    let liveRun: TurnLiveRun?
    let thought: String?
    let content: TurnDetailsContent
    let turns: [AgentTurn]?
    let onOpen: (TurnDetailsRoute) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if showsName, let typist, liveRun != nil || turns?.isEmpty == false {
                CaptainIdentityLabel(typist: typist, side: 20)
            }
            if let liveRun {
                TurnLiveRunSection(
                    run: liveRun,
                    steps: steps(for: liveRun),
                    onOpen: { onOpen(.step($0)) }
                )
            }
            if let turns {
                let settled = turns.filter { $0.runID != liveRun?.runID }
                if !settled.isEmpty {
                    TurnEarlierCard(turns: settled) { turn in
                        onOpen(.turn(agentID: turn.agentID, runID: turn.runID))
                    }
                } else if liveRun == nil, !showsName {
                    Text("No turns yet.")
                        .font(.subheadline)
                        .foregroundStyle(HausPlatformColor.mutedInk)
                }
            }
        }
    }

    /// The journal names steps exactly when the viewer may read it; activity names them for everyone.
    private func steps(for run: TurnLiveRun) -> [TurnStep] {
        if content.showsExecutionEvidence, let journal = content.journalsByRunID[run.runID], !journal.tools.isEmpty {
            return TurnJournalSteps.steps(journal)
        }
        return TurnActivitySteps.steps(run.events, thought: thought)
    }
}

/// "Working for 1m 42s" over a run's steps, the current one bright.
private struct TurnLiveRunSection: View {
    let run: TurnLiveRun
    let steps: [TurnStep]
    let onOpen: (TurnStepDetail) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let start = run.startedAt ?? run.events.first?.occurredAt {
                TimelineView(.periodic(from: .now, by: 1)) { timeline in
                    TurnDivider(text: TurnDetailsCopy.working(since: start, now: timeline.date), isLive: true)
                }
            } else {
                TurnDivider(text: "Working", isLive: true)
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(steps) { step in
                    TurnStepRow(step: step, isCurrent: step.id == currentID, onOpen: onOpen)
                }
            }
        }
    }

    private var currentID: String? {
        steps.last { $0.isRunning }?.id ?? steps.last?.id
    }
}

/// A rule with words centered in it; a live one shimmers.
struct TurnDivider: View {
    let text: String
    let isLive: Bool

    var body: some View {
        HStack(spacing: 12) {
            rule
            Text(text)
                .font(.subheadline)
                .monospacedDigit()
                .foregroundStyle(HausPlatformColor.mutedInk)
                .lineLimit(1)
                .workerShimmer(isLive)
                .layoutPriority(1)
            rule
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }

    private var rule: some View {
        Rectangle().fill(HausPlatformColor.hairline).frame(height: 1)
    }
}

/// One step: muted when done, bright while it is the current one, with a chevron when it opens.
struct TurnStepRow: View {
    let step: TurnStep
    let isCurrent: Bool
    let onOpen: (TurnStepDetail) -> Void

    var body: some View {
        if let detail = step.detail {
            Button { onOpen(detail) } label: { label(opens: true) }
                .buttonStyle(.plain)
                .accessibilityHint("Shows the step")
        } else {
            label(opens: false)
        }
    }

    private func label(opens: Bool) -> some View {
        HStack(spacing: 6) {
            Text(step.label)
                .lineLimit(1)
                .truncationMode(.middle)
                .foregroundStyle(color)
                .workerShimmer(isCurrent && step.isRunning)
            if opens {
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(HausPlatformColor.faintInk)
                    .accessibilityHidden(true)
            }
        }
        .font(.callout)
        .frame(minHeight: 32, alignment: .leading)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityValue(step.isFailed ? "Failed" : step.isRunning ? "In progress" : "")
    }

    private var color: Color {
        if step.isFailed { return HausPlatformColor.critical }
        return isCurrent && step.isRunning ? HausPlatformColor.ink : HausPlatformColor.mutedInk
    }
}

/// "Earlier": a card of settled turns, newest first.
private struct TurnEarlierCard: View {
    let turns: [AgentTurn]
    let onOpen: (AgentTurn) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Earlier")
                .font(.subheadline)
                .foregroundStyle(HausPlatformColor.mutedInk)
                .padding(.leading, 12)
                .accessibilityAddTraits(.isHeader)
            VStack(spacing: 0) {
                ForEach(Array(turns.enumerated()), id: \.element.id) { index, turn in
                    if index > 0 {
                        Rectangle().fill(HausPlatformColor.hairline).frame(height: 1).padding(.leading, 20)
                    }
                    Button { onOpen(turn) } label: { row(turn) }
                        .buttonStyle(.plain)
                }
            }
            .background(HausPlatformColor.card, in: .rect(cornerRadius: HausRadius.grouped, style: .continuous))
        }
    }

    private func row(_ turn: AgentTurn) -> some View {
        HStack(spacing: 8) {
            Text(TurnDetailsCopy.settled(turn))
                .foregroundStyle(turn.status == .failed ? HausPlatformColor.critical : HausPlatformColor.ink)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(TurnDetailsCopy.when(turn.endedAt))
                .font(.subheadline)
                .foregroundStyle(HausPlatformColor.mutedInk)
                .lineLimit(1)
            Image(systemName: "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(HausPlatformColor.faintInk)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 20)
        .frame(minHeight: 52)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}

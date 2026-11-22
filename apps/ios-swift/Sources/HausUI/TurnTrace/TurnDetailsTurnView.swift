import HausModels
import SwiftUI

/// One settled turn: when and how long, its summary, what it did by kind, and for Owners and
/// Admins its outline's steps.
struct TurnDetailsTurnView: View {
    let turn: AgentTurn
    let outline: AgentExecutionOutlineEntry?
    let onOpen: (TurnDetailsRoute) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                TurnDivider(text: TurnDetailsCopy.when(turn.startedAt), isLive: false)
                if let summary = turn.summary?.trimmingCharacters(in: .whitespacesAndNewlines), !summary.isEmpty {
                    Text(summary)
                        .font(.body)
                        .foregroundStyle(HausPlatformColor.ink)
                        .textSelection(.enabled)
                }
                steps
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle(TurnDetailsCopy.settled(turn))
        .hausInlineNavigationTitle()
    }

    @ViewBuilder
    private var steps: some View {
        switch outline {
        case .available(let outline):
            VStack(alignment: .leading, spacing: 0) {
                ForEach(TurnJournalSteps.steps(outline)) { step in
                    TurnStepRow(step: step, isCurrent: false, onOpen: { onOpen(.step($0)) })
                }
                if let omitted = outline.omittedSteps, omitted > 0 {
                    Text("\(omitted) more \(omitted == 1 ? "step" : "steps") not shown")
                        .font(.footnote)
                        .foregroundStyle(HausPlatformColor.faintInk)
                        .padding(.top, 6)
                }
            }
        case .missing, nil:
            let operations = turn.activity.operations.filter { $0.completed + $0.failed + $0.interrupted > 0 }
            if operations.isEmpty {
                Text(turn.outputProduced ? "Replied without using tools." : "No steps recorded.")
                    .font(.callout)
                    .foregroundStyle(HausPlatformColor.mutedInk)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(operations, id: \.category) { operation in
                        Text(TraceFoldLabel.label(operation))
                            .font(.callout)
                            .foregroundStyle(operation.failed > 0 ? HausPlatformColor.critical : HausPlatformColor.mutedInk)
                            .frame(minHeight: 32, alignment: .leading)
                    }
                }
            }
        }
    }
}

/// A step's drill-in: its command or thought, folded when long.
struct TurnStepDetailView: View {
    let detail: TurnStepDetail

    @State private var isExpanded = false

    var body: some View {
        let fold = TraceLineFold(detail.body)
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                if let caption = detail.caption {
                    Text(caption)
                        .font(.footnote)
                        .foregroundStyle(HausPlatformColor.mutedInk)
                }
                Text(isExpanded ? detail.body : fold?.head ?? detail.body)
                    .font(.callout.monospaced())
                    .foregroundStyle(HausPlatformColor.ink)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(HausPlatformColor.fill, in: .rect(cornerRadius: HausRadius.medium, style: .continuous))
                if let fold {
                    Button(TraceLineFold.control(hiddenLines: fold.hiddenLines, isExpanded: isExpanded)) {
                        withAnimation(.snappy(duration: 0.22)) { isExpanded.toggle() }
                    }
                    .font(.subheadline)
                    .foregroundStyle(HausPlatformColor.accentInk)
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .navigationTitle(detail.title)
        .hausInlineNavigationTitle()
    }
}

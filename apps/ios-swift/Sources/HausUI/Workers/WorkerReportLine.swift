import Foundation
import HausModels
import SwiftUI

/// A Worker report in a Task chat, as one centered muted line that opens the
/// Worker: "Router seam finished, worked for 14m · 1 PR".
public struct WorkerReportLinePresentation: Hashable, Sendable {
    public enum Outcome: Hashable, Sendable { case finished, needsYou, failed }

    public let text: String

    public init(title: String?, outcome: Outcome, span: TimeInterval?, pullRequestCount: Int) {
        let words = switch outcome {
        case .finished: "finished"
        case .needsYou: "needs you"
        case .failed: "failed"
        }
        var text = "\(title ?? "Worker") \(words)"
        if let span { text += ", worked for \(WorkerDuration.text(span))" }
        if pullRequestCount > 0 {
            text += " · \(pullRequestCount) \(pullRequestCount == 1 ? "PR" : "PRs")"
        }
        self.text = text
    }

    /// Reads the report of one turn, or nil while that turn has not reported.
    public init?(worker: Worker, turnId: String) {
        guard let turn = worker.runs.first(where: { $0.runId == turnId }) else { return nil }
        let record = WorkerTurnRecord(turn: turn)
        let outcome: Outcome? = switch record.outcome {
        case .finished: .finished
        case .needsYou: .needsYou
        case .failed: .failed
        case .stopped, nil: nil
        }
        guard let outcome else { return nil }
        self.init(
            title: worker.title,
            outcome: outcome,
            span: record.span,
            pullRequestCount: record.pullRequests.count
        )
    }
}

/// The report line view: tapping it opens the Worker.
public struct WorkerReportLine: View {
    private let presentation: WorkerReportLinePresentation
    private let open: () -> Void

    public init(_ presentation: WorkerReportLinePresentation, open: @escaping () -> Void) {
        self.presentation = presentation
        self.open = open
    }

    public var body: some View {
        Button(action: open) {
            Text(presentation.text)
                .font(.subheadline)
                .foregroundStyle(HausPlatformColor.mutedInk)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .padding(.horizontal, 20)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Opens the Worker")
    }
}

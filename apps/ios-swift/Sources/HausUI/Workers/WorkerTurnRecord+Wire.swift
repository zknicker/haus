import Foundation
import HausModels

extension WorkerTurnRecord {
    /// How a settled turn reads: its outcome, the report's prose, and the pull
    /// requests the report named.
    struct Settled: Hashable {
        let outcome: Outcome
        let report: String?
        let pullRequestUrls: [String]
    }

    static func settled(_ outcome: WorkerOutcome) -> Settled {
        switch outcome {
        case .report(let report):
            Settled(
                outcome: Self.outcome(report.outcome),
                report: reportContent(report),
                pullRequestUrls: report.pullRequestUrls
            )
        case .stopped:
            Settled(outcome: .stopped, report: nil, pullRequestUrls: [])
        case .failed(let reason, _):
            Settled(outcome: .failed(reason: failureLabel(reason)), report: nil, pullRequestUrls: [])
        }
    }

    static func outcome(_ reported: WorkerReportOutcome) -> Outcome {
        switch reported {
        case .done: .finished
        case .needsYou: .needsYou
        case .failed: .failed(reason: nil)
        }
    }

    /// The report's text, then its ask when the ask says something the text
    /// does not; a provider's needs-you report carries its text as both.
    static func reportContent(_ report: WorkerReport) -> String {
        guard let ask = report.ask?.trimmingCharacters(in: .whitespacesAndNewlines), !ask.isEmpty,
              ask != report.text.trimmingCharacters(in: .whitespacesAndNewlines)
        else { return report.text }
        return report.text.isEmpty ? ask : "\(report.text)\n\n\(ask)"
    }

    /// Mirrors the web's `workerFailureLabels`.
    static func failureLabel(_ reason: WorkerFailure) -> String {
        switch reason {
        case .harnessError: "The harness failed to start or crashed"
        case .launchRefused: "The place refused the launch"
        case .machineOffline: "The Device stayed offline during the turn"
        case .machineRemoved: "The Device was removed"
        case .noReport: "Ended without a report"
        case .placeOff: "Workers were turned off on its place"
        case .providerError: "The provider ended the run in error"
        case .providerExpired: "The provider expired the run"
        }
    }

    /// The branches' pull requests, then each one the report named that no
    /// branch already shows.
    static func merging(_ branchPullRequests: [WorkerCitedPullRequest], _ reportUrls: [String]) -> [WorkerCitedPullRequest] {
        var seen = Set(branchPullRequests.map(\.id))
        let reported = reportUrls.compactMap(WorkerCitedPullRequest.init(url:)).filter { seen.insert($0.id).inserted }
        return branchPullRequests + reported
    }
}

extension WorkerCitedPullRequest {
    /// A GitHub pull request URL, `https://github.com/<owner>/<name>/pull/<n>`;
    /// nil for any other shape.
    init?(url raw: String) {
        guard let url = WorkerPresentation.externalURL(raw) else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count >= 4, parts[2] == "pull", let number = Int(parts[3]), number > 0 else { return nil }
        self.init(repository: "\(parts[0])/\(parts[1])", number: number, state: .unknown, url: url)
    }
}

extension WorkerStepEntry {
    /// One wire step as the chain draws it.
    public init(step: WorkerStep) {
        self.init(
            kind: Kind(step.kind),
            label: step.label,
            state: State(step.state),
            additions: step.additions,
            deletions: step.deletions,
            output: step.output
        )
    }
}

extension WorkerStepEntry.Kind {
    init(_ wire: WorkerStep.Kind) {
        switch wire {
        case .read: self = .read
        case .edit: self = .edit
        case .run: self = .run
        case .search: self = .search
        }
    }
}

extension WorkerStepEntry.State {
    init(_ wire: WorkerStep.State) {
        switch wire {
        case .running: self = .running
        case .done: self = .done
        case .failed: self = .failed
        }
    }
}

/// The Drive files a report cites as `[label](drive://<path>)` (specs/artifact-drive.md
/// "Citations"): percent-decoded paths in the order they appear, each once, at
/// most 100. Images and links inside code never cite.
enum WorkerDriveCitations {
    static let limit = 100

    static func paths(in text: String) -> [String] {
        guard let expression = linkExpression else { return [] }
        let prose = proseOutsideCode(text)
        var seen = Set<String>()
        let paths = expression
            .matches(in: prose, range: NSRange(prose.startIndex..., in: prose))
            .compactMap { match in
                guard let range = Range(match.range(at: 0), in: prose),
                      let target = Range(match.range(at: 1), in: prose)
                else { return nil }
                if range.lowerBound > prose.startIndex, prose[prose.index(before: range.lowerBound)] == "!" {
                    return nil
                }
                return path(target: String(prose[target]))
            }
            .filter { seen.insert($0).inserted }
        return Array(paths.prefix(limit))
    }

    static func path(target: String) -> String? {
        let trimmed = target.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasPrefix(prefix),
              let decoded = String(trimmed.dropFirst(prefix.count)).removingPercentEncoding
        else { return nil }
        let segments = decoded.split(separator: "/", omittingEmptySubsequences: false)
        guard !decoded.isEmpty, !decoded.hasPrefix("/"),
              segments.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." })
        else { return nil }
        return decoded
    }

    /// The text with fenced code blocks and inline code spans blanked out.
    static func proseOutsideCode(_ text: String) -> String {
        var inFence = false
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map { line in
            if line.trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                inFence.toggle()
                return ""
            }
            return inFence ? "" : String(line)
        }
        let joined = lines.joined(separator: "\n")
        guard let inlineCode else { return joined }
        return inlineCode.stringByReplacingMatches(
            in: joined, range: NSRange(joined.startIndex..., in: joined), withTemplate: ""
        )
    }

    private static let prefix = "drive://"
    private static let linkExpression = try? NSRegularExpression(pattern: #"\[[^\]\n]+\]\(([^\)\s]+)\)"#)
    private static let inlineCode = try? NSRegularExpression(pattern: #"`[^`\n]*`"#)
}

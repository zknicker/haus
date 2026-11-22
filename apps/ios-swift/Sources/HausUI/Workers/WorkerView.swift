import HausModels
import SwiftUI

/// What the Worker view can ask the app to do.
public struct WorkerViewActions {
    public var sendFollowUp: (WorkerFollowUpDraft) async throws -> Void
    public var stop: () async throws -> Void
    public var openPullRequest: (WorkerCitedPullRequest) -> Void
    public var openFile: (String) -> Void
    /// Opens the Worker at its provider; nil hides the action.
    public var openInProvider: (() -> Void)?
    /// Copies the Worker's link; nil hides the action.
    public var copyLink: (() -> Void)?
    /// Opens the attachment picker; nil hides the composer's plus.
    public var attach: (() -> Void)?

    public init(
        sendFollowUp: @escaping (WorkerFollowUpDraft) async throws -> Void,
        stop: @escaping () async throws -> Void,
        openPullRequest: @escaping (WorkerCitedPullRequest) -> Void,
        openFile: @escaping (String) -> Void,
        openInProvider: (() -> Void)? = nil,
        copyLink: (() -> Void)? = nil,
        attach: (() -> Void)? = nil
    ) {
        self.sendFollowUp = sendFollowUp
        self.stop = stop
        self.openPullRequest = openPullRequest
        self.openFile = openFile
        self.openInProvider = openInProvider
        self.copyLink = copyLink
        self.attach = attach
    }
}

/// One Worker: where it runs, each turn's prompt, steps, and report, and a
/// follow-up composer whose send turns into Stop Worker while a turn runs.
public struct WorkerView: View {
    private let worker: Worker
    private let turns: [WorkerTurnRecord]?
    private let taskKey: String?
    private let canFollowUp: Bool
    private let actions: WorkerViewActions
    @Binding private var draft: String

    /// - Parameters:
    ///   - turns: the turns, newest first, when the caller reads more than the
    ///     wire turn carries; nil reads `worker.runs`.
    ///   - canFollowUp: the Task is open and the Worker is not closed.
    public init(
        worker: Worker,
        turns: [WorkerTurnRecord]? = nil,
        taskKey: String? = nil,
        canFollowUp: Bool,
        draft: Binding<String>,
        actions: WorkerViewActions
    ) {
        self.worker = worker
        self.turns = turns
        self.taskKey = taskKey
        self.canFollowUp = canFollowUp
        self.actions = actions
        _draft = draft
    }

    public var body: some View {
        let liveTurn = WorkerLiveTurn(worker: worker)
        TimelineView(.periodic(from: .now, by: liveTurn == nil ? 3600 : 15)) { context in
            transcript(WorkerThreadPresentation(worker: worker, turns: turns, taskKey: taskKey, now: context.date))
        }
        .background(HausPlatformColor.canvas)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if canFollowUp {
                WorkerFollowUpComposer(
                    text: $draft,
                    placeholder: WorkerFollowUpControls.placeholder(status: worker.workerStatus, live: liveTurn != nil),
                    liveTurn: liveTurn,
                    attach: actions.attach,
                    send: actions.sendFollowUp,
                    stop: actions.stop
                )
                .padding(.bottom, 8)
            }
        }
        .toolbar {
            ToolbarItem(placement: .principal) { titleView }
            if actions.openInProvider != nil || actions.copyLink != nil {
                ToolbarItem(placement: .primaryAction) { menu }
            }
        }
        .hausInlineNavigationTitle()
    }

    private func transcript(_ thread: WorkerThreadPresentation) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                Text(thread.placeLine)
                    .font(.subheadline)
                    .foregroundStyle(HausPlatformColor.mutedInk)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
                    .padding(.top, 24)
                ForEach(thread.entries) { entry in
                    WorkerThreadEntryView(entry: entry, actions: actions)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
        .defaultScrollAnchor(.bottom)
        .scrollDismissesKeyboard(.interactively)
    }

    private var titleView: some View {
        HStack(spacing: 8) {
            DotGrid(dot: 2.2, gap: 2)
                .frame(width: DotGrid.side(dot: 2.2, gap: 2), height: DotGrid.side(dot: 2.2, gap: 2))
                .foregroundStyle(HausPlatformColor.mutedInk)
            Text(worker.title)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(HausPlatformColor.ink)
                .lineLimit(1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private var menu: some View {
        Menu {
            if let openInProvider = actions.openInProvider {
                Button("Open in \(WorkerPresentation.providerName(worker.provider))", action: openInProvider)
            }
            if let copyLink = actions.copyLink {
                Button("Copy link", systemImage: "link", action: copyLink)
            }
        } label: {
            Image(systemName: "ellipsis")
        }
        .accessibilityLabel("Worker actions")
    }
}

/// One line of the Worker's conversation.
struct WorkerThreadEntryView: View {
    let entry: WorkerThreadEntry
    let actions: WorkerViewActions

    var body: some View {
        switch entry {
        case .prompt(_, let text):
            WorkerPromptBubble(text: text)
        case .divider(_, let text, let live):
            WorkerTurnDivider(text: text, live: live)
        case .steps(_, let groups):
            WorkerStepChain(groups: groups)
        case .report(_, let text):
            RichMessageContentView(blocks: RichMessageBlockParser.blocks(text) { _, _, _ in nil })
                .foregroundStyle(HausPlatformColor.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
        case .citations(_, let pullRequests, let files):
            WorkerCitationChips(
                pullRequests: pullRequests,
                files: files,
                openPullRequest: actions.openPullRequest,
                openFile: actions.openFile
            )
        case .settlement(_, let text):
            Text(text)
                .font(.subheadline)
                .foregroundStyle(HausPlatformColor.mutedInk)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
    }
}

/// What someone asked the Worker, as a trailing bubble.
private struct WorkerPromptBubble: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.body)
            .foregroundStyle(HausPlatformColor.ink)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(HausPlatformColor.fill, in: .rect(cornerRadius: 18))
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.leading, 48)
            .textSelection(.enabled)
    }
}

/// A rule with the turn's duration centered in it; the live one shimmers.
private struct WorkerTurnDivider: View {
    let text: String
    let live: Bool

    var body: some View {
        HStack(spacing: 12) {
            rule
            Text(text)
                .font(.subheadline)
                .foregroundStyle(HausPlatformColor.mutedInk)
                .lineLimit(1)
                .workerShimmer(live)
                .layoutPriority(1)
            rule
        }
        .padding(.vertical, 4)
    }

    private var rule: some View {
        Rectangle()
            .fill(HausPlatformColor.hairline)
            .frame(height: 1)
    }
}

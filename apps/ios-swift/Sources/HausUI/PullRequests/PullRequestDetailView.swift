import SwiftUI
#if os(iOS)
import UIKit
#endif

extension HausTextRole {
    static let pullRequestTitle = HausTextRole(size: 24, weight: .regular, textStyle: .title2)
}

/// Where the detail's From rows go. The App routes each one.
public struct PullRequestDetailActions {
    public let openTask: (PullRequestTaskLink) -> Void
    public let openWorker: (PullRequestWorkerLink) -> Void

    public init(
        openTask: @escaping (PullRequestTaskLink) -> Void,
        openWorker: @escaping (PullRequestWorkerLink) -> Void
    ) {
        self.openTask = openTask
        self.openWorker = openWorker
    }
}

/// A pull request, read-only: its title and author, a box of facts (state,
/// review, branch, diffstat, files), its checks, the Task and Worker report it
/// came from, and Copy link and Open in GitHub. Haus never acts on a pull
/// request; review, comment, and merge happen on GitHub.
public struct PullRequestDetailView: View {
    private let pullRequest: PullRequestPresentation
    private let actions: PullRequestDetailActions

    @State private var toast: HausToast?
    @Environment(\.openURL) private var openURL

    public init(pullRequest: PullRequestPresentation, actions: PullRequestDetailActions) {
        self.pullRequest = pullRequest
        self.actions = actions
    }

    public var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(pullRequest.title)
                        .hausFont(.pullRequestTitle)
                        .foregroundStyle(HausPlatformColor.ink)
                        .padding(.top, 8)
                    PullRequestAuthorLine(pullRequest: pullRequest, now: context.date)
                        .padding(.top, 10)
                    PullRequestFactsBox(pullRequest: pullRequest, onCopyBranch: copyBranch)
                        .padding(.top, 18)
                    PullRequestChecksRow(pullRequest: pullRequest)
                        .padding(.top, 20)
                    PullRequestFromSection(pullRequest: pullRequest, actions: actions)
                    Text(pullRequest.sourceNote)
                        .hausFont(.workRowMeta)
                        .foregroundStyle(HausPlatformColor.faintInk)
                        .padding(.top, 28)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
        }
        .background(HausPlatformColor.canvas)
        .hausInlineNavigationTitle()
        .safeAreaBar(edge: .bottom) { bottomRow }
        .glassToast(toast)
        .task(id: toast?.id) {
            guard toast != nil else { return }
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            toast = nil
        }
    }

    @ViewBuilder
    private var bottomRow: some View {
        if let url = pullRequest.url {
            HStack {
                GlassChromeButton(.system("link"), label: "Copy link") { copy(url) }
                Spacer()
                Button {
                    openURL(url)
                } label: {
                    HStack(spacing: 6) {
                        Text("Open in GitHub")
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .font(HausFont.font(size: 16, weight: .medium))
                    .padding(.horizontal, 4)
                    .frame(minHeight: 30)
                }
                .buttonStyle(.glassProminent)
                .tint(HausPlatformColor.accent)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
    }

    private func copyBranch(_ branch: String) {
        #if os(iOS)
        UIPasteboard.general.string = branch
        #endif
        toast = HausToast("Branch copied", systemImage: "checkmark")
    }

    private func copy(_ url: URL) {
        #if os(iOS)
        UIPasteboard.general.url = url
        #endif
        toast = HausToast("Link copied", systemImage: "checkmark")
    }
}

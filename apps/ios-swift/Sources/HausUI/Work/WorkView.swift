import SwiftUI

/// Where the Work view's rows go when tapped. The App routes each one.
public struct WorkViewActions {
    public let openPullRequest: (PullRequestPresentation) -> Void
    public let openFile: (DriveFilePresentation) -> Void

    public init(
        openPullRequest: @escaping (PullRequestPresentation) -> Void,
        openFile: @escaping (DriveFilePresentation) -> Void
    ) {
        self.openPullRequest = openPullRequest
        self.openFile = openFile
    }
}

/// A place's work: the pull requests its Tasks opened and its recent Drive
/// files, under filter chips.
///
/// The title is the stock centered inline title over the navigation stack's
/// own back button. Blank while the content loads; an empty state only once it
/// has loaded and the filter has nothing to show.
public struct WorkView: View {
    private let content: WorkViewContent?
    private let actions: WorkViewActions

    @State private var filter: WorkFilter = .all

    public init(content: WorkViewContent?, actions: WorkViewActions) {
        self.content = content
        self.actions = actions
    }

    public var body: some View {
        body(content)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(HausPlatformColor.canvas)
            .hausScreenTitle("Work")
    }

    @ViewBuilder
    private func body(_ content: WorkViewContent?) -> some View {
        if let content {
            TimelineView(.periodic(from: .now, by: 60)) { context in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        chips
                        list(content, now: context.date)
                    }
                    .padding(.bottom, 24)
                }
            }
        }
    }

    private var chips: some View {
        FilterChipRow {
            ForEach(WorkFilter.allCases, id: \.self) { option in
                FilterChip(option.title, isSelected: filter == option) {
                    filter = option
                }
            }
        }
        .padding(.top, 8)
    }

    @ViewBuilder
    private func list(_ content: WorkViewContent, now: Date) -> some View {
        let sections = content.sections(for: filter)
        if sections.isEmpty {
            ContentUnavailableView(emptyTitle, systemImage: "square.grid.3x3")
                .padding(.top, 80)
        } else {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(sections, id: \.self) { section in
                    WorkListSection(
                        section.title,
                        count: content.showsCount(section) ? content.count(of: section) : nil
                    ) {
                        rows(section, in: content, now: now)
                    }
                }
            }
            .padding(.horizontal, 20)
        }
    }

    @ViewBuilder
    private func rows(_ section: WorkSection, in content: WorkViewContent, now: Date) -> some View {
        switch section {
        case .pullRequests:
            PullRequestRows(pullRequests: content.pullRequests, now: now, onOpen: actions.openPullRequest)
        case .pullRequestGroup(let group):
            PullRequestRows(pullRequests: content.pullRequests(in: group), now: now, onOpen: actions.openPullRequest)
        case .files:
            DriveFileRows(files: content.files, now: now, onOpen: actions.openFile)
        }
    }

    private var emptyTitle: String {
        switch filter {
        case .all: "No work yet"
        case .pullRequests: "No open pull requests"
        case .files: "No files"
        }
    }
}

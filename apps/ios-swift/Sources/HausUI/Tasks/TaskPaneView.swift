import HausModels
import SwiftUI

/// The Task beside its conversation (specs/ios-app.md, Task mode): whoever
/// started it, its activity and Close, then its title, then Activity and
/// Files. It has no composer; the conversation's composer steers it. Its
/// controls stay in the pane, since the detail column's one bar belongs to
/// both panes.
public struct TaskPaneView: View {
    private let pane: TaskPanePresentation
    private let actions: TaskPaneActions

    @State private var section = TaskPaneSection.activity
    @State private var files: [DriveFilePresentation]?
    @Environment(\.taskPaneEdge) private var edge

    public init(pane: TaskPanePresentation, actions: TaskPaneActions) {
        self.pane = pane
        self.actions = actions
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            ScrollView {
                Group {
                    switch section {
                    case .activity: TaskPaneActivity(agentID: pane.agentID)
                    case .files: TaskPaneFiles(files: pane.agentID == nil ? [] : files, open: actions.openFile)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(HausPlatformColor.groupedBackground)
        .overlay(alignment: edge == .top ? .top : .leading) {
            Rectangle()
                .fill(HausPlatformColor.hairline)
                .frame(width: edge == .top ? nil : 1, height: edge == .top ? 1 : nil)
                .ignoresSafeArea()
        }
        .task(id: pane.agentID) {
            guard let agentID = pane.agentID else { return }
            files = await actions.loadFiles(agentID)
        }
        .carriesAcrossPoses($section, as: "taskPaneSection")
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Task \(pane.header.title)")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                if let starter = pane.starter {
                    TaskPaneStarter(starter: starter)
                }
                TaskPaneStatus(disc: pane.header.disc)
                Spacer(minLength: 8)
                Button("Close Task", systemImage: "xmark", action: actions.close)
                    .labelStyle(.iconOnly)
                    .buttonStyle(.glass)
                    .buttonBorderShape(.circle)
            }
            .frame(minHeight: 44)
            Text(pane.header.title)
                .font(.title3.weight(.semibold))
                .foregroundStyle(HausPlatformColor.ink)
                .lineLimit(3)
                .accessibilityAddTraits(.isHeader)
            Picker("Show", selection: $section) {
                ForEach(TaskPaneSection.allCases, id: \.self) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            .fixedSize()
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 6)
    }
}

private struct TaskPaneStarter: View {
    let starter: MessageAuthorPresentation

    var body: some View {
        HStack(spacing: 8) {
            if starter.kind == .captain {
                CaptainAvatarMark(name: starter.name, url: starter.avatarURL, side: 22)
            } else {
                AvatarView(name: starter.name, url: starter.avatarURL, size: 22)
            }
            Text(starter.name)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(HausPlatformColor.ink)
                .lineLimit(1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Started by \(starter.name)")
    }
}

/// The Task's activity, as the web App's chip says it.
private struct TaskPaneStatus: View {
    let disc: TaskDiscState

    var body: some View {
        HStack(spacing: 5) {
            TaskActivityDisc(state: disc, size: 14, surface: HausPlatformColor.groupedBackground)
            Text(disc.label)
                .font(.caption.weight(.medium))
                .foregroundStyle(HausPlatformColor.mutedInk)
                .lineLimit(1)
        }
        .padding(.horizontal, 9)
        .frame(height: 24)
        .background(HausPlatformColor.fill, in: .capsule)
        .accessibilityElement(children: .combine)
    }
}

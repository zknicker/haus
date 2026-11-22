import SwiftUI

/// A Project or Captain the "Ask anything" card can pick.
public struct AskAnythingChoice: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let avatarURL: URL?
    public let appearance: ChannelAppearance

    public init(id: String, name: String, avatarURL: URL? = nil, appearance: ChannelAppearance = .default) {
        self.id = id
        self.name = name
        self.avatarURL = avatarURL
        self.appearance = appearance
    }
}

/// The composer card the accessory opens: a new Task for a chosen Captain in a
/// chosen Project. Send returns false to keep the draft when the Server refuses.
public struct AskAnythingCard: View {
    @Binding private var text: String
    private let interaction: ComposerInteraction
    private let projects: [AskAnythingChoice]
    private let captains: [AskAnythingChoice]
    @Binding private var projectID: String?
    @Binding private var captainID: String?
    private let error: String?
    private let onSend: (String) async -> Bool

    @FocusState private var isFocused: Bool

    public init(
        text: Binding<String>,
        interaction: ComposerInteraction,
        projects: [AskAnythingChoice],
        captains: [AskAnythingChoice],
        projectID: Binding<String?>,
        captainID: Binding<String?>,
        error: String?,
        onSend: @escaping (String) async -> Bool
    ) {
        _text = text
        self.interaction = interaction
        self.projects = projects
        self.captains = captains
        _projectID = projectID
        _captainID = captainID
        self.error = error
        self.onSend = onSend
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                picker(projects, selection: $projectID, empty: "No projects") { choice in
                    ChannelIconBox(appearance: choice.appearance, size: 18)
                }
                picker(captains, selection: $captainID, empty: "No Captains") { choice in
                    AvatarView(name: choice.name, url: choice.avatarURL, presence: nil, size: 18)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            if let error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .padding(.horizontal, 16)
            }
            MessageComposerView(
                text: $text,
                interaction: interaction,
                place: .task,
                isTextFocused: $isFocused,
                allowsAttachments: false,
                onSend: { content, _ in await onSend(content) }
            )
        }
        .padding(.top, 20)
        .padding(.bottom, 8)
        .task { isFocused = true }
        .presentationDetents([.height(220), .medium])
        .presentationDragIndicator(.visible)
    }

    private func picker<Mark: View>(
        _ choices: [AskAnythingChoice],
        selection: Binding<String?>,
        empty: String,
        @ViewBuilder mark: @escaping (AskAnythingChoice) -> Mark
    ) -> some View {
        let selected = choices.first { $0.id == selection.wrappedValue }
        return Menu {
            ForEach(choices) { choice in
                Button(choice.name) { selection.wrappedValue = choice.id }
            }
        } label: {
            HStack(spacing: 6) {
                if let selected { mark(selected) }
                Text(selected?.name ?? empty)
                    .font(.callout.weight(.medium))
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .frame(height: 33)
            .glassEffect(.regular.interactive(), in: .capsule)
        }
        .buttonStyle(.plain)
        .disabled(choices.isEmpty)
    }
}

/// The tab bar's accessory: an "Ask anything" field that opens the card.
public struct AskAnythingAccessory: View {
    private let action: () -> Void

    public init(action: @escaping () -> Void) {
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: "plus")
                    .font(.body.weight(.medium))
                    .frame(width: 36, height: 36)
                    .glassEffect(.regular, in: .circle)
                Text("Ask anything")
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 6)
            .frame(maxWidth: .infinity, minHeight: 47)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ask anything")
        .accessibilityHint("Starts a Task for a Captain")
    }
}

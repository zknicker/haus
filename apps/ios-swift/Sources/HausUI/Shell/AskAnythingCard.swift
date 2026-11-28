import SwiftUI

/// A Project, Machine, or model the "Ask anything" card can pick.
public struct AskAnythingChoice: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let appearance: ChannelAppearance

    public init(id: String, name: String, appearance: ChannelAppearance = .default) {
        self.id = id
        self.name = name
        self.appearance = appearance
    }
}

/// One pick row of the card: what it offers and what is picked.
public struct AskAnythingPicker {
    let choices: [AskAnythingChoice]
    let selection: Binding<String?>

    public init(choices: [AskAnythingChoice], selection: Binding<String?>) {
        self.choices = choices
        self.selection = selection
    }
}

/// The composer card the accessory opens: a new Task in a chosen Project, on
/// a chosen Machine with a chosen model, as the web App's Home composer
/// starts one. Send returns false to keep the draft when the Server refuses.
public struct AskAnythingCard: View {
    @Binding private var text: String
    private let interaction: ComposerInteraction
    private let project: AskAnythingPicker
    private let machine: AskAnythingPicker
    private let model: AskAnythingPicker
    private let error: String?
    private let onSend: (String) async -> Bool

    @FocusState private var isFocused: Bool

    public init(
        text: Binding<String>,
        interaction: ComposerInteraction,
        project: AskAnythingPicker,
        machine: AskAnythingPicker,
        model: AskAnythingPicker,
        error: String?,
        onSend: @escaping (String) async -> Bool
    ) {
        _text = text
        self.interaction = interaction
        self.project = project
        self.machine = machine
        self.model = model
        self.error = error
        self.onSend = onSend
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    picker(project, empty: "No projects") { choice in
                        ChannelIconBox(appearance: choice.appearance, size: 18)
                    }
                    picker(machine, empty: "No Machine attached") { _ in
                        Image(systemName: "laptopcomputer").foregroundStyle(.secondary)
                    }
                    picker(model, empty: "No models") { _ in
                        Image(systemName: "sparkles").foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 16)
            }
            .scrollIndicators(.hidden)
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
        _ picker: AskAnythingPicker,
        empty: String,
        @ViewBuilder mark: @escaping (AskAnythingChoice) -> Mark
    ) -> some View {
        let choices = picker.choices
        let selected = choices.first { $0.id == picker.selection.wrappedValue }
        return Menu {
            ForEach(choices) { choice in
                Button(choice.name) { picker.selection.wrappedValue = choice.id }
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
                    .frame(width: 35, height: 35)
                    .background(HausPlatformColor.label.opacity(0.12), in: .circle)
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
        .accessibilityHint("Starts a Task")
    }
}

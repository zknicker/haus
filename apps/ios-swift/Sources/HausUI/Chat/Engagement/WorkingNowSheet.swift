import HausModels
import SwiftUI

/// Who is answering the Chat and what each is on, opened from the header's
/// engagement row — the phone's stand-in for the App's hover recall. One row
/// per working Agent with its latest thought, updating live. When everyone
/// finishes it says so for a moment and closes itself.
struct WorkingNowSheet: View {
    static let closeDelay: Duration = .seconds(1.2)

    let model: ChatTypingModel
    let source: ChatEngagementSource

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let typists = ChatTypingLabel.typists(model.shownEngagements, resolve: source.typist)
        VStack(alignment: .leading, spacing: 0) {
            Text("Working now")
                .font(.headline)
                .padding(.horizontal, 20)
                .padding(.top, 22)
                .padding(.bottom, 10)
                .accessibilityAddTraits(.isHeader)
            if typists.isEmpty {
                Text("Everyone’s done.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .transition(.opacity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(typists) { typist in
                            WorkingNowRow(typist: typist, thought: model.latestThought(for: typist.id)?.text)
                                .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }
                }
                .scrollBounceBehavior(.basedOnSize)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .animation(.smooth(duration: 0.3), value: typists.map(\.id))
        .presentationDetents([.fraction(0.3), .medium])
        .presentationDragIndicator(.visible)
        .task(id: typists.isEmpty) {
            guard typists.isEmpty else { return }
            try? await Task.sleep(for: Self.closeDelay)
            guard !Task.isCancelled else { return }
            dismiss()
        }
    }
}

private struct WorkingNowRow: View {
    let typist: ChatTypist
    let thought: String?

    @ScaledMetric(relativeTo: .body) private var avatarSize: CGFloat = 36

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            AvatarView(name: typist.name, url: typist.avatarURL, size: avatarSize)
            VStack(alignment: .leading, spacing: 2) {
                Text(typist.name)
                    .font(.body.weight(.semibold))
                ZStack(alignment: .leading) {
                    Text(thought ?? "Working…")
                        .font(.subheadline)
                        .foregroundStyle(thought == nil ? .tertiary : .secondary)
                        .lineLimit(3)
                        .id(thought)
                        .transition(.opacity)
                }
                .animation(.easeInOut(duration: 0.3), value: thought)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            EngagementDots()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(typist.name)
        .accessibilityValue(thought ?? "Working")
    }
}

import SwiftUI

/// The Agent's offered options as the human's own answer.
///
/// They read in the order the Agent wrote them, the recommendation first and
/// the only one emphasized. An Ask with no options is an open question and
/// offers no buttons — the composer below is the whole answer.
struct AskOptions: Equatable, Sendable {
    let options: [String]

    init(_ options: [String]) {
        self.options = options
    }

    var isOffered: Bool { !options.isEmpty }

    /// The Agent's recommendation is the first option it wrote, and the one
    /// option drawn as the prominent button.
    func isRecommendation(_ index: Int) -> Bool { index == 0 }

    /// What a pressed option sends: that option's text, verbatim. Pressing it
    /// and typing the same words are the same Message, so nothing decorates it.
    func answer(at index: Int) -> String? {
        options.indices.contains(index) ? options[index] : nil
    }

    /// What the card says about the composer under it. Buttons make free text
    /// the other way out; an open question has no other way.
    var freeTextHint: String {
        isOffered ? "Or write a reply below." : "Write your answer below."
    }
}

/// How far the card's one answer has got.
///
/// One press spends the whole card: the Ask leaves on its own `ask.updated`
/// refetch rather than optimistically, and until it does a second press would
/// only post a second answer. A send that failed spends nothing — the reader
/// still has a decision to make, and the card says the send did not land.
enum AskAnswerPress: Equatable, Sendable {
    case idle
    case sending
    case answered

    var isSpent: Bool { self != .idle }
}

/// One open Ask, answered where it was asked: a card under the Ask's own
/// Message inside the Thread, the same surface the App draws.
///
/// The card states the decision and whose turn it is; the question itself is
/// the Message above and is never repeated here. Only the Ask the Thread's
/// next reply would settle carries controls — an older open Ask keeps the
/// header alone, because a reply here would not answer it. An answered Ask
/// draws nothing at all.
struct AskAnswerCard: View {
    let ask: AskPresentation
    /// Whether this is the Ask a reply in this Thread settles.
    let canAnswer: Bool
    /// The Thread's own send. It already addresses the parent Chat and this
    /// anchor Message, which is exactly where an Ask's answer goes.
    let onAnswer: (String) async -> Bool

    /// The send reports only whether it landed, so the card states the failure
    /// in its own words rather than swallowing it.
    static let failureText = "That answer didn’t send. Try again."

    @State private var press: AskAnswerPress = .idle
    @State private var didFail = false

    private var options: AskOptions { AskOptions(ask.options) }

    var body: some View {
        if ask.status == .open {
            card.padding(.top, 6)
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 8) {
            header

            if canAnswer, options.isOffered {
                optionButtons
            }

            if canAnswer {
                Text(options.freeTextHint)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if didFail {
                Text(Self.failureText)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(HausPlatformColor.inputSurface, in: .rect(cornerRadius: 12))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(accessibilityLabel)
    }

    private var header: some View {
        HStack(spacing: 8) {
            if let addressee = ask.addressee {
                AvatarView(
                    name: addressee.name,
                    url: addressee.avatarURL,
                    presence: addressee.presence,
                    size: 28
                )
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(AskPresentation.answerCardTitle(addressee: ask.addressee))
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Text(AskPresentation.awaitingAnswer)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityHidden(true)
    }

    private var optionButtons: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(Array(options.options.enumerated()), id: \.offset) { index, option in
                    optionButton(option, isRecommendation: options.isRecommendation(index))
                }
            }
            .padding(.vertical, 2)
        }
        .scrollIndicators(.hidden)
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .accessibilityLabel("Answer options")
    }

    @ViewBuilder
    private func optionButton(_ option: String, isRecommendation: Bool) -> some View {
        let button = Button(option) { answer(with: option) }
            .controlSize(.small)
            .buttonBorderShape(.capsule)
            .lineLimit(1)
            .disabled(press.isSpent)

        if isRecommendation {
            button.buttonStyle(.borderedProminent)
        } else {
            button.buttonStyle(.bordered)
        }
    }

    private func answer(with option: String) {
        guard !press.isSpent else { return }
        press = .sending
        didFail = false
        Task { @MainActor in
            if await onAnswer(option) {
                press = .answered
            } else {
                press = .idle
                didFail = true
            }
        }
    }

    private var accessibilityLabel: String {
        var parts = [
            AskPresentation.answerCardTitle(addressee: ask.addressee),
            AskPresentation.awaitingAnswer,
        ]
        if canAnswer { parts.append(options.freeTextHint) }
        if didFail { parts.append(Self.failureText) }
        return parts.joined(separator: ". ")
    }
}

#Preview("Ask answer card") {
    VStack(alignment: .leading, spacing: 16) {
        AskAnswerCard(
            ask: AskPresentation(
                status: .open,
                addressee: MessageAuthorPresentation(id: "u1", name: "Zach", avatarURL: nil),
                options: ["Rename it", "Keep #product", "Ask the channel"]
            ),
            canAnswer: true
        ) { _ in true }

        AskAnswerCard(
            ask: AskPresentation(
                status: .open,
                addressee: MessageAuthorPresentation(id: "u1", name: "Zach", avatarURL: nil)
            ),
            canAnswer: true
        ) { _ in true }

        AskAnswerCard(
            ask: AskPresentation(
                status: .open,
                addressee: MessageAuthorPresentation(id: "u1", name: "Zach", avatarURL: nil),
                options: ["Friday", "Monday"]
            ),
            canAnswer: false
        ) { _ in true }
    }
    .padding(20)
}

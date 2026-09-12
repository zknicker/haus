import SwiftUI

/// The Agent's offered options as the human's own answer.
///
/// They read in the order the Agent wrote them, the recommendation first and
/// the only one emphasized. An Ask with no options is an open question and
/// offers nothing here — the composer below is the whole answer.
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
}

/// How far the row's one answer has got.
///
/// One press spends the whole row: the Ask leaves on its own `ask.updated`
/// refetch rather than optimistically, and until it does a second press would
/// only post a second answer. A send that failed spends nothing — the reader
/// still has a decision to make.
enum AskAnswerPress: Equatable, Sendable {
    case idle
    case sending
    case answered

    var isSpent: Bool { self != .idle }
}

/// The offered options, sitting directly above the Thread composer that would
/// otherwise carry the same words.
///
/// It is a sibling of the composer, never part of it: the composer is a custom
/// surface with its own glass and portal, and the options are the other way of
/// answering, not a control inside it.
struct AskOptionsRow: View {
    let options: AskOptions
    /// The Thread's own send. It already addresses the parent Chat and this
    /// anchor Message, which is exactly where an Ask's answer goes.
    let onAnswer: (String) async -> Bool

    @State private var press: AskAnswerPress = .idle

    var body: some View {
        if options.isOffered {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(Array(options.options.enumerated()), id: \.offset) { index, option in
                        optionButton(option, isRecommendation: options.isRecommendation(index))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 2)
            }
            .scrollIndicators(.hidden)
            .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
            .accessibilityLabel("Answer options")
        }
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
        Task { @MainActor in
            press = await onAnswer(option) ? .answered : .idle
        }
    }
}

#Preview("Ask options") {
    VStack {
        Spacer()
        AskOptionsRow(options: AskOptions(["Rename it", "Keep #product", "Ask the channel"])) { _ in
            true
        }
    }
    .padding(.bottom, 40)
}

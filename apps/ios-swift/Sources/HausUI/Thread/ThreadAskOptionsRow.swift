import HausModels
import SwiftUI

/// The newest open Ask in a Thread, offered above that Thread's composer.
///
/// `ThreadAskOptions` owns which Ask that is — the anchor's own, or one an Agent
/// posted as a reply. Pressing an option is the Thread's own send, which already
/// addresses the parent Chat and this anchor Message — the exact pair an Ask's
/// answer takes (`AskAnswerRoute`), whichever Ask in the Thread it settles. A
/// settled Ask keeps only its marker: the first answer won permanently.
struct ThreadAskOptionsRow: View {
    /// The viewer's open Asks, read in the Thread screen's body so an Ask posted
    /// as a reply lands here the moment `ask.listOpen` does.
    let openAsks: [OpenAsk]?
    let anchor: MessagePresentation
    /// The Thread's own send, already addressed to the parent Chat and anchor.
    let onAnswer: (String) async -> Bool

    var body: some View {
        if let offer = ThreadAskOptions.offered(openAsks: openAsks, anchor: anchor) {
            AskOptionsRow(options: offer.options, onAnswer: onAnswer)
                // A second Ask is a second decision: its own row, not one a
                // previous answer already spent.
                .id(offer.id)
        }
    }
}

import HausModels
import SwiftUI
#if os(iOS)
import UIKit
#endif

extension View {
    /// The long-press drawer for a transcript message: quick reactions and
    /// the message's actions at medium height, growing to a full emoji picker.
    /// A nil handler leaves its action out. The drawer sits over the
    /// transcript, which never moves for it.
    func messageActionDrawer(
        for message: Binding<MessagePresentation?>,
        board: ReactionStickerBoard?,
        onReply: ((MessagePresentation) -> Void)? = nil,
        onOpenThread: ((MessagePresentation) -> Void)? = nil
    ) -> some View {
        #if os(iOS)
        modifier(MessageActionDrawerPresenter(
            message: message,
            board: board,
            onReply: onReply,
            onOpenThread: onOpenThread
        ))
        #else
        self
        #endif
    }
}

#if os(iOS)

/// Presents the drawer, and runs what was chosen once it has gone: a push or
/// the composer's focus would otherwise race the sheet's dismissal.
private struct MessageActionDrawerPresenter: ViewModifier {
    @Binding var message: MessagePresentation?
    let board: ReactionStickerBoard?
    let onReply: ((MessagePresentation) -> Void)?
    let onOpenThread: ((MessagePresentation) -> Void)?
    @State private var afterDismiss: (() -> Void)?

    func body(content: Content) -> some View {
        content
            // The press lands as the drawer rises, not on rows it ignores.
            .sensoryFeedback(.impact(weight: .medium), trigger: message?.id) { _, new in new != nil }
            .sheet(item: $message, onDismiss: {
                afterDismiss?()
                afterDismiss = nil
            }) { target in
                MessageActionDrawer(
                    message: target,
                    board: board,
                    groups: MessageActionMenu.groups(
                        for: target,
                        canReplyInline: onReply != nil,
                        canOpenThread: onOpenThread != nil
                    ),
                    onAction: { action in perform(action, on: target) },
                    onReact: { emoji, remove in react(emoji, remove: remove, on: target) }
                )
            }
    }

    private func perform(_ action: MessageAction, on target: MessagePresentation) {
        switch action {
        case .reply: afterDismiss = { onReply?(target) }
        case .replyInThread, .openThread: afterDismiss = { onOpenThread?(target) }
        case .copyText:
            UIPasteboard.general.string = target.prose
        }
        message = nil
    }

    /// Sends a validated emoji at once; its stamp waits for the drawer to
    /// finish sliding away so it lands where the viewer can see it.
    private func react(_ emoji: String, remove: Bool, on target: MessagePresentation) {
        message = nil
        guard let board, let emoji = ReactionEmoji.normalized(emoji) else { return }
        if !remove { FrequentEmoji().record(emoji) }
        board.toggle(messageID: target.id, emoji: emoji, remove: remove, stampDelay: 0.5)
    }
}

/// The drawer's content. The sheet is stock — detents, grabber, corner, and
/// dimming are the system's — and the message stays put in the transcript.
struct MessageActionDrawer: View {
    let message: MessagePresentation
    let board: ReactionStickerBoard?
    let groups: [[MessageAction]]
    let onAction: (MessageAction) -> Void
    let onReact: (_ emoji: String, _ remove: Bool) -> Void

    @State private var isPicking = false
    /// The actions page's own height, measured, so the sheet ends at Copy Text.
    @State private var fitHeight: CGFloat = 300
    @State private var detent: PresentationDetent = .height(300)
    @State private var path: [Route] = []

    /// Discord's picker height: tall enough for a real grid without taking
    /// the whole screen.
    static let pickerDetent = PresentationDetent.fraction(0.75)

    enum Route: Hashable { case reactors }

    var body: some View {
        let pile = board?.pile(messageID: message.id, reactions: message.reactions)
        let entries = pile?.all ?? []
        let ownEmoji = Set(entries.filter(\.reactor.isViewer).map(\.emoji))
        NavigationStack(path: $path) {
            Group {
                if isPicking {
                    EmojiPickerView(
                        catalog: .shared,
                        frequent: FrequentEmoji().ordered(),
                        onPick: { onReact($0, false) },
                        onBack: { setPicking(false) }
                    )
                    .transition(.opacity)
                } else {
                    MessageActionList(
                        quickTiles: board == nil ? nil : MessageActionMenu.quickTiles(frequent: FrequentEmoji().ordered()),
                        ownEmoji: ownEmoji,
                        summary: MessageActionMenu.reactorSummary(entries),
                        groups: groups,
                        onReact: onReact,
                        onMore: { setPicking(true) },
                        onAction: onAction,
                        onHeight: fit
                    )
                    .transition(.opacity)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: Route.self) { _ in
                MessageReactorsList(
                    rows: MessageActionMenu.reactorRows(entries),
                    onRemove: { onReact($0, true) }
                )
            }
        }
        .presentationDetents(detents, selection: $detent)
        .presentationDragIndicator(.visible)
        .presentationBackground(HausPlatformColor.groupedBackground)
        // A list of names can run long; the drawer grows to meet the push.
        .onChange(of: path.isEmpty) { _, isRoot in
            detent = isRoot ? .height(fitHeight) : Self.pickerDetent
        }
    }

    /// The actions page fits its content exactly; the picker and the
    /// reactors list open at the picker height and can be dragged to full.
    private var detents: Set<PresentationDetent> {
        isPicking || !path.isEmpty ? [Self.pickerDetent, .large] : [.height(fitHeight)]
    }

    private func fit(_ height: CGFloat) {
        let height = height.rounded(.up)
        guard abs(height - fitHeight) > 0.5 else { return }
        fitHeight = height
        if !isPicking, path.isEmpty { detent = .height(height) }
    }

    private func setPicking(_ picking: Bool) {
        withAnimation(.snappy(duration: 0.25)) {
            isPicking = picking
            detent = picking ? Self.pickerDetent : .height(fitHeight)
        }
    }
}
#endif

import SwiftUI
import UniformTypeIdentifiers
#if os(iOS)
import UIKit
#endif

public struct MessageComposerView: View {
    @Binding private var text: String
    @Bindable private var interaction: ComposerInteraction
    private let placeholder: String
    private let allowsAttachments: Bool
    private let mentionOptions: [MentionOptionPresentation]
    private let inlineReply: MessageReplyReferencePresentation?
    private let onCancelInlineReply: () -> Void
    private let transitionNamespace: Namespace.ID?
    private let model: ComposerModelControl?
    private let onSend: (String, [ComposerAttachment]) async -> Bool

    @FocusState.Binding private var isTextFocused: Bool
    @AccessibilityFocusState private var isAttachmentButtonFocused: Bool
    @State private var attachmentReadyFeedback = 0
    @State private var sendFeedback = 0
    @State private var sendFailureFeedback = 0
    /// The pill's one-line field and its circles, scaled with Dynamic Type.
    @ScaledMetric(relativeTo: .body) private var compactFieldHeightLimit: CGFloat = 24
    @ScaledMetric(relativeTo: .body) private var controlDiameter: CGFloat = 36
    /// True while a surface tap re-issues a focus summons, so the momentary
    /// focus drop never reaches the expansion layout.
    @State private var isReissuingFocus = false
    /// The live height floor while a finger holds the grabber.
    @State private var dragFloor: CGFloat?
    @State private var controlsHeight: CGFloat = 0

    public init(
        text: Binding<String>,
        interaction: ComposerInteraction,
        placeholder: String,
        isTextFocused: FocusState<Bool>.Binding,
        allowsAttachments: Bool = true,
        mentionOptions: [MentionOptionPresentation] = [],
        inlineReply: MessageReplyReferencePresentation? = nil,
        onCancelInlineReply: @escaping () -> Void = {},
        transitionNamespace: Namespace.ID? = nil,
        model: ComposerModelControl? = nil,
        onSend: @escaping (String, [ComposerAttachment]) async -> Bool
    ) {
        _text = text
        self.interaction = interaction
        self.placeholder = placeholder
        _isTextFocused = isTextFocused
        self.allowsAttachments = allowsAttachments
        self.mentionOptions = mentionOptions
        self.inlineReply = inlineReply
        self.onCancelInlineReply = onCancelInlineReply
        self.transitionNamespace = transitionNamespace
        self.model = model
        self.onSend = onSend
    }

    public var body: some View {
        // No `GlassEffectContainer`: the composer has one glass shape, so there is nothing to merge.
        MessageComposerStack(
            text: $text,
            mentionOptions: mentionOptions,
            inlineReply: inlineReply,
            onCancelInlineReply: onCancelInlineReply,
            surface: { composerSurface }
        )
            .padding(.horizontal, ComposerSurfaceMetrics.sideMargin)
            .padding(.top, isFullHeight ? ComposerSurfaceMetrics.fullHeightTopClearance : 4)
            .padding(.bottom, isExpanded ? 8 : 0)
            // No opaque band: the transcript runs to the bottom of the screen and passes under the
            // glass, which is the only thing that gives it something to be translucent against.
            .animation(.spring(response: 0.3, dampingFraction: 0.9), value: isExpanded)
            .animation(.easeOut(duration: 0.24), value: interaction.attachments.count)
            .sensoryFeedback(.success, trigger: attachmentReadyFeedback)
            .sensoryFeedback(.impact(weight: .light), trigger: sendFeedback)
            .sensoryFeedback(.error, trigger: sendFailureFeedback)
            .sensoryFeedback(.selection, trigger: interaction.draftHeight)
            // Text focus belongs to the portal freeze, which restores exactly what the portal
            // interrupted; this view only moves VoiceOver's cursor back to the plus button when no
            // keyboard is coming back to claim it.
            .onChange(of: interaction.overlay) { _, overlay in
                guard overlay == nil else {
                    isAttachmentButtonFocused = false
                    return
                }
                Task { @MainActor in
                    await Task.yield()
                    isAttachmentButtonFocused = !isTextFocused
                }
            }
            // A full-height draft that collapses on its own settles back to the card. A portal
            // round trip does not count: it hands focus back to the draft it interrupted.
            .onChange(of: isExpanded) { _, expanded in
                guard !expanded else { return }
                dragFloor = nil
                guard interaction.overlay == nil, !interaction.portalFreeze.isEngaged else { return }
                interaction.draftHeight = .card
            }
            .onChange(of: interaction.attachmentReadySequence) { _, _ in
                let addedCount = interaction.lastReadyAttachmentCount
                guard addedCount > 0 else { return }
                attachmentReadyFeedback += 1
                announceAccessibility(
                    addedCount == 1 ? "Attachment ready" : "\(addedCount) attachments ready"
                )
            }
            .fileImporter(
                isPresented: $interaction.isFileImporterPresented,
                allowedContentTypes: [.data],
                allowsMultipleSelection: true
            ) { result in
                switch result {
                case .success(let urls):
                    interaction.stageImportedFiles(urls)
                    isTextFocused = true
                case .failure(let error): interaction.errorMessage = error.localizedDescription
                }
            }
            // A file that could not be staged is a native alert, not a caption
            // floating over the transcript the composer sits on.
            .composerAttachmentAlert(message: $interaction.errorMessage)
            // The interaction outlives this view, so leaving takes the presentation state and
            // nothing else. Skipped while the file importer owns the screen: that presentation is
            // what dismissed this view, and resetting would dismiss the importer with it.
            .onDisappear {
                guard !interaction.isFileImporterPresented else { return }
                interaction.resetPresentation()
            }
    }

    private var composerSurface: some View {
        surfaceBody
            .contentShape(.rect(cornerRadius: surfaceCornerRadius))
            // Taps on the text area itself go to the field natively; this
            // gesture only catches the surface around it.
            .onTapGesture {
                guard isTextFocused else {
                    isTextFocused = true
                    return
                }
                // Already focused: either the keyboard is up and the tap has nothing to do, or a
                // prior programmatic focus never reached UIKit's responder chain. Cycling re-issues
                // the summons; `isReissuingFocus` holds the expanded layout through the flip.
                isReissuingFocus = true
                isTextFocused = false
                Task { @MainActor in
                    await Task.yield()
                    isTextFocused = true
                    isReissuingFocus = false
                }
            }
            .background {
                GeometryReader { geometry in
                    Color.clear
                        .onAppear { reportSurfaceFrame(geometry) }
                        .onChange(of: geometry.frame(in: .global)) { _, _ in
                            reportSurfaceFrame(geometry)
                        }
                }
            }
    }

    private var surfaceBody: some View {
        composerContents
            .padding(.horizontal, ComposerSurfaceMetrics.expandedControlInset)
            .padding(.top, isExpanded ? ComposerGrabber.zoneHeight : ComposerSurfaceMetrics.restingControlInset)
            .padding(.bottom, isExpanded
                ? ComposerSurfaceMetrics.expandedControlInset
                : ComposerSurfaceMetrics.restingControlInset)
            .overlay(alignment: .top) {
                if isExpanded {
                    ComposerGrabber(
                        draftHeight: $interaction.draftHeight,
                        dragFloor: $dragFloor,
                        currentHeight: controlsHeight
                    )
                    .transition(.opacity)
                }
            }
            .composerGlassSurface(cornerRadius: surfaceCornerRadius)
    }

    private var showsAttachmentStrip: Bool {
        !interaction.attachments.isEmpty || interaction.isPreparingAttachment
    }

    /// Reported in `.global` — window coordinates — because the portal is drawn in a window of its
    /// own above the keyboard. The app is portrait-only and full-screen, so both windows span the
    /// same display and the two spaces are numerically identical.
    private func reportSurfaceFrame(_ geometry: GeometryProxy) {
        interaction.composerSurfaceFrame = geometry.frame(in: .global)
    }

    private var composerContents: some View {
        VStack(alignment: .leading, spacing: 10) {
            if showsAttachmentStrip {
                ComposerAttachmentStrip(
                    interaction: interaction,
                    runsFlight: transitionNamespace != nil
                ) { attachment in
                    announceAccessibility("Removed \(attachment.filename)")
                    interaction.remove(attachment)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            ComposerControlLayout(
                expansion: isExpanded ? 1 : 0,
                compactFieldHeightLimit: compactFieldHeightLimit,
                compactMinimumHeight: controlDiameter,
                expandedHeightFloor: isExpanded ? dragFloor ?? 0 : 0,
                fillsProposedHeight: isFullHeight && dragFloor == nil
            ) {
                ComposerCircleButton(
                    icon: .plus,
                    style: .plus(isEnabled: canAttach),
                    label: "Add attachment",
                    action: toggleSourceMenu
                )
                .disabled(!canAttach)
                .accessibilityFocused($isAttachmentButtonFocused)
                messageField
                toolbarAccessory
                ComposerCircleButton(
                    icon: .send,
                    style: .send(canSend: canSend),
                    label: "Send message",
                    action: submit
                )
                .composerSendPresence(canSend)
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { controlsHeight = $0 }
        }
    }

    private var messageField: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(placeholder)
                    .foregroundStyle(HausTone.mutedInk.color)
                    .lineLimit(1)
                    .allowsHitTesting(false)
            }

            ComposerMessageInput(
                text: $text,
                options: mentionOptions,
                label: placeholder,
                fillsHeight: isExpanded && (isFullHeight || dragFloor != nil)
            )
            .focused($isTextFocused)
        }
        .clipped()
    }

    @ViewBuilder
    private var toolbarAccessory: some View {
        if let model {
            ComposerModelChip(control: model)
                .opacity(isExpanded ? 1 : 0)
                .allowsHitTesting(isExpanded)
                .accessibilityHidden(!isExpanded)
        } else {
            Color.clear.frame(width: 0, height: 0)
        }
    }

    private func toggleSourceMenu() {
        let opens = interaction.overlay == nil
        withAnimation(opens ? ComposerPortalMotion.open : ComposerPortalMotion.close) {
            interaction.overlay = opens ? .sources : nil
        }
    }

    private var canAttach: Bool {
        allowsAttachments && interaction.remainingCapacity > 0
    }

    private var canSend: Bool {
        !interaction.isPreparingAttachment
            && (!text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || !interaction.attachments.isEmpty)
    }

    private var isExpanded: Bool {
        Self.shouldExpand(
            isFocused: isTextFocused || isReissuingFocus,
            hasAttachments: !interaction.attachments.isEmpty,
            isPreparingAttachment: interaction.isPreparingAttachment
        )
    }

    private var isFullHeight: Bool { isExpanded && interaction.draftHeight == .full }

    private var surfaceCornerRadius: CGFloat {
        isExpanded
            ? ComposerSurfaceMetrics.expandedCornerRadius
            : ComposerSurfaceMetrics.restingCornerRadius
    }

    private func submit() {
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let submittedAttachments = interaction.attachments
        guard !content.isEmpty || !submittedAttachments.isEmpty else { return }

        text = ""
        interaction.attachments = []
        interaction.errorMessage = nil
        withAnimation(ComposerDraftHeight.settleMotion) { interaction.draftHeight = .card }
        sendFeedback += 1
        Task {
            // True means the message is the viewer's row in the transcript — sent, or kept there
            // marked failed with Try Again. False means it never left, so the draft comes back.
            if await onSend(content, submittedAttachments) { return }
            text = text.isEmpty ? content : [content, text].filter { !$0.isEmpty }.joined(separator: "\n")
            interaction.attachments = submittedAttachments + interaction.attachments
            sendFailureFeedback += 1
        }
    }

    private func announceAccessibility(_ message: String) {
        #if os(iOS)
        UIAccessibility.post(notification: .announcement, argument: message)
        #endif
    }
}

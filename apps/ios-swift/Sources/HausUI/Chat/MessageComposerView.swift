import SwiftUI
import UniformTypeIdentifiers
#if os(iOS)
import UIKit
#endif

public struct MessageComposerView: View {
    @Binding private var text: String
    @Bindable private var interaction: ComposerInteraction
    private let placeholder: String
    private let isConnected: Bool
    private let allowsAttachments: Bool
    private let mentionOptions: [MentionOptionPresentation]
    private let inlineReply: MessageReplyReferencePresentation?
    private let onCancelInlineReply: () -> Void
    private let transitionNamespace: Namespace.ID?
    private let onSend: (String, [ComposerAttachment]) async -> Bool

    @FocusState.Binding private var isTextFocused: Bool
    @AccessibilityFocusState private var isAttachmentButtonFocused: Bool
    @State private var attachmentReadyFeedback = 0
    /// True while a surface tap re-issues a focus summons, so the momentary
    /// focus drop never reaches the expansion layout.
    @State private var isReissuingFocus = false

    public init(
        text: Binding<String>,
        interaction: ComposerInteraction,
        placeholder: String,
        isConnected: Bool,
        isTextFocused: FocusState<Bool>.Binding,
        allowsAttachments: Bool = true,
        mentionOptions: [MentionOptionPresentation] = [],
        inlineReply: MessageReplyReferencePresentation? = nil,
        onCancelInlineReply: @escaping () -> Void = {},
        transitionNamespace: Namespace.ID? = nil,
        onSend: @escaping (String, [ComposerAttachment]) async -> Bool
    ) {
        _text = text
        self.interaction = interaction
        self.placeholder = placeholder
        self.isConnected = isConnected
        _isTextFocused = isTextFocused
        self.allowsAttachments = allowsAttachments
        self.mentionOptions = mentionOptions
        self.inlineReply = inlineReply
        self.onCancelInlineReply = onCancelInlineReply
        self.transitionNamespace = transitionNamespace
        self.onSend = onSend
    }

    public var body: some View {
        // Deliberately not wrapped in a `GlassEffectContainer`: a container exists to merge sibling
        // glass shapes into one layer, and the composer has a single glass shape with the status
        // banner as a separate object, so there is nothing here to merge. The earlier reason — that
        // the merged layer dimmed the shell's rim — described the hand-rolled specular overlay that
        // `ComposerGlassSurface` no longer paints, so it no longer argues against a container. If
        // the composer and the attachment portal are ever morphed as one glass object, that is the
        // change to reach for.
        MessageComposerStack(
            text: $text,
            mentionOptions: mentionOptions,
            inlineReply: inlineReply,
            onCancelInlineReply: onCancelInlineReply,
            status: { statusView },
            surface: { composerSurface }
        )
            .padding(.horizontal, isExpanded ? 12 : 24)
            .padding(.top, 4)
            .padding(.bottom, isExpanded ? 8 : 0)
            // No opaque band: the transcript runs to the bottom of the screen and passes under the
            // glass, which is the only thing that gives it something to be translucent against.
            .animation(.spring(response: 0.3, dampingFraction: 0.9), value: isExpanded)
            .animation(.easeOut(duration: 0.24), value: interaction.attachments.count)
            .animation(.smooth(duration: 0.22), value: isConnected)
            .sensoryFeedback(.success, trigger: attachmentReadyFeedback)
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
            // The interaction outlives this view — a Chat switch or a push-over
            // destroys the screen while the shell keeps the staged attachments —
            // so leaving takes the presentation state and nothing else. Files
            // the user picked are discarded only by sending, by removing a tile,
            // or by their whole destination going away. Skipped while the file
            // importer owns the screen: that presentation is what dismissed this
            // view, and resetting would dismiss the importer with it.
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
                // Already focused: either the keyboard is up and the tap has
                // nothing to do, or a prior programmatic focus never reached
                // UIKit's responder chain and the field only looks focused —
                // the same failure the portal freeze recovers from. Cycling
                // re-issues the summons. `isReissuingFocus` holds the expanded
                // layout through the flip: without it, every tap in an
                // environment where no keyboard can rise (a hardware keyboard)
                // visibly collapses and re-expands the composer, and the
                // controls dodge the very tap trying to reach them.
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
            .padding(.leading, isExpanded ? 10 : 12)
            // The send circle's trailing inset matches its vertical inset in both states — nesting
            // into the expanded corner, centering in the pill — so the gap around it reads uniform.
            .padding(.trailing, 7)
            // A staged attachment tile sits square in the corner: its top inset matches the 10pt
            // leading inset. The taller 17pt top belongs to the text-only expanded state.
            .padding(.top, showsAttachmentStrip ? 10 : isExpanded ? 17 : 7)
            .padding(.bottom, 7)
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
                attachmentStrip.transition(.move(edge: .bottom).combined(with: .opacity))
            }

            ComposerControlLayout(expansion: isExpanded ? 1 : 0) {
                attachmentButton
                messageField
                sendButton
            }
        }
    }

    private var messageField: some View {
        ZStack(alignment: .leading) {
            if text.isEmpty {
                Text(placeholder)
                    .foregroundStyle(HausPlatformColor.secondaryLabel)
                    .lineLimit(1)
                    .allowsHitTesting(false)
            }

            TextField("", text: $text, axis: .vertical)
                .foregroundStyle(.primary)
                .focused($isTextFocused)
                .lineLimit(1...6)
        }
        .clipped()
    }

    /// Explicit colors — not the hierarchical `.primary`/`.secondary` styles — so the glass
    /// vibrancy context cannot wash the send circle out to grey.
    private var sendButton: some View {
        Button(action: submit) {
            Circle()
                .fill(canSend ? HausPlatformColor.label : HausPlatformColor.disabledControlFill)
                .frame(width: 34, height: 34)
                .overlay {
                    HausIcon(.send, size: 19, weight: 2.4)
                        .foregroundStyle(HausPlatformColor.background)
                }
                .compositingGroup()
        }
        .buttonStyle(.pressable)
        .disabled(!canSend)
        .animation(.easeOut(duration: 0.16), value: canSend)
        .accessibilityLabel("Send message")
    }

    private var attachmentButton: some View {
        Button {
            let opens = interaction.overlay == nil
            withAnimation(opens ? ComposerPortalMotion.open : ComposerPortalMotion.close) {
                interaction.overlay = opens ? .sources : nil
            }
        } label: {
            HausIcon(.plus, size: 21, weight: 1.8)
                .frame(width: 32, height: 32)
                .contentShape(.circle)
        }
        .buttonStyle(.pressable)
        .foregroundStyle(.primary)
        .disabled(!allowsAttachments || interaction.remainingCapacity == 0)
        .accessibilityLabel("Add attachment")
        .accessibilityFocused($isAttachmentButtonFocused)
    }

    private var attachmentStrip: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 4) {
                ForEach(interaction.attachments) { attachment in
                    attachmentTile(attachment)
                }
                if interaction.isPreparingAttachment {
                    ProgressView()
                        .frame(width: 88, height: 88)
                        .background(.quaternary, in: .rect(cornerRadius: 14))
                        .accessibilityLabel("Preparing attachment")
                }
            }
        }
        .scrollIndicators(.hidden)
    }

    private func attachmentTile(_ attachment: ComposerAttachment) -> some View {
        // Only a screen that owns a transition namespace runs the attachment flight, and only its
        // landing tile hides itself and reports where the flying photo has to arrive. The frame is
        // reported for as long as the flight lasts, because the tile keeps moving while the
        // composer grows the strip around it.
        let isFlightDestination = transitionNamespace != nil
            && interaction.morphingAttachmentID == attachment.id
        return ComposerAttachmentTile(attachment: attachment) {
            announceAccessibility("Removed \(attachment.filename)")
            interaction.remove(attachment)
        }
        .opacity(isFlightDestination ? 0 : 1)
        .background {
            if isFlightDestination {
                GeometryReader { geometry in
                    Color.clear
                        .onAppear { reportDestinationFrame(geometry) }
                        .onChange(of: geometry.frame(in: .global)) { _, _ in
                            reportDestinationFrame(geometry)
                        }
                }
            }
        }
    }

    private func reportDestinationFrame(_ geometry: GeometryProxy) {
        interaction.morphDestinationFrame = geometry.frame(in: .global)
    }

    @ViewBuilder
    private var statusView: some View {
        if let error = interaction.errorMessage {
            errorNotice(error)
        } else if !isConnected {
            ConnectionStatusBanner()
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    /// The composer no longer sits on an opaque band, so a send failure carries its own surface
    /// rather than laying red text straight over the transcript running underneath.
    @ViewBuilder
    private func errorNotice(_ message: String) -> some View {
        let label = Text(message)
            .font(.caption)
            .foregroundStyle(.red)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
        if #available(iOS 26, macOS 26, *) {
            label.glassEffect(.regular, in: .rect(cornerRadius: 14))
        } else {
            label.background(.thinMaterial, in: .rect(cornerRadius: 14))
        }
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

    private var surfaceCornerRadius: CGFloat {
        isExpanded
            ? ComposerSurfaceMetrics.expandedCornerRadius
            : ComposerSurfaceMetrics.restingCornerRadius
    }

    /// Deliberately blind to the portal: the plus button on a collapsed composer opens the source
    /// menu over the pill without expanding it, and a portal opened from a focused composer keeps
    /// its keyboard — so focus alone holds the expanded shell for the portal's whole lifecycle.
    static func shouldExpand(
        isFocused: Bool,
        hasAttachments: Bool,
        isPreparingAttachment: Bool
    ) -> Bool {
        isFocused || hasAttachments || isPreparingAttachment
    }

    private func submit() {
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let submittedAttachments = interaction.attachments
        guard !content.isEmpty || !submittedAttachments.isEmpty else { return }

        text = ""
        interaction.attachments = []
        interaction.errorMessage = nil
        Task {
            if await onSend(content, submittedAttachments) {
                submittedAttachments.forEach(ComposerAttachmentStager.remove)
                return
            }
            text = text.isEmpty ? content : [content, text].filter { !$0.isEmpty }.joined(separator: "\n")
            interaction.attachments = submittedAttachments + interaction.attachments
            interaction.errorMessage = "Message not sent. Your draft is ready to retry."
        }
    }

    private func announceAccessibility(_ message: String) {
        #if os(iOS)
        UIAccessibility.post(notification: .announcement, argument: message)
        #endif
    }
}

import SwiftUI

/// A message's attachments, as inline image tiles and file rows.
///
/// The row opens nothing itself. It writes what it wants opened into the
/// screen's `AttachmentPreview` binding, because the cell it is hosted in has
/// no view controller to present from and the image viewer's transition has to
/// outlive that cell.
struct MessageAttachmentGroup: View {
    private let attachments: [MessageAttachmentPresentation]
    private let isPending: Bool
    private let onOpen: (MessageAttachmentPresentation) async throws -> URL
    private let tiles: AttachmentImageTileRegistry?

    @Binding private var preview: AttachmentPreview?
    @State private var loadingAttachmentID: String?
    @State private var imageTileFailedIDs: Set<String> = []

    init(
        attachments: [MessageAttachmentPresentation],
        isPending: Bool = false,
        preview: Binding<AttachmentPreview?> = .constant(nil),
        tiles: AttachmentImageTileRegistry? = nil,
        onOpen: @escaping (MessageAttachmentPresentation) async throws -> URL
    ) {
        self.attachments = attachments
        self.isPending = isPending
        _preview = preview
        self.tiles = tiles
        self.onOpen = onOpen
    }

    private var layout: MessageAttachmentLayout.Resolved {
        MessageAttachmentLayout.resolve(
            attachments: attachments,
            isPending: isPending,
            failedImageIDs: imageTileFailedIDs
        )
    }

    var body: some View {
        let layout = layout
        VStack(alignment: .leading, spacing: 6) {
            switch layout.style {
            case .hero:
                if let image = layout.images.first {
                    attachmentButton(image) { imageTile(image, box: .hero) }
                }
            case .strip:
                MessageImageStrip(
                    attachments: layout.images,
                    // A file row resolving its bytes owns the preview binding
                    // until it lands, so the strip stops taking taps with it.
                    isDisabled: loadingAttachmentID != nil,
                    onOpen: onOpen,
                    onFailure: { imageTileFailedIDs.insert($0.id) },
                    onTap: { open($0) },
                    tiles: isPending ? nil : tiles
                )
            }
            ForEach(layout.files) { attachment in
                attachmentButton(attachment) { attachmentRow(attachment) }
            }
        }
    }

    private func attachmentButton(
        _ attachment: MessageAttachmentPresentation,
        @ViewBuilder label: () -> some View
    ) -> some View {
        Button {
            open(attachment)
        } label: {
            label()
        }
        .buttonStyle(.plain)
        .disabled(loadingAttachmentID != nil)
        .accessibilityLabel("Preview \(attachment.filename)")
    }

    /// Image attachments render as pictures — including pending uploads, which
    /// decode from their staged local file so the row occupies its final box
    /// from the first frame instead of morphing file row → placeholder →
    /// photo. Everything else keeps the file row.
    private func imageTile(
        _ attachment: MessageAttachmentPresentation,
        box: AttachmentImageTileBox
    ) -> some View {
        AttachmentImageTile(
            attachment: attachment,
            onOpen: onOpen,
            onFailure: { imageTileFailedIDs.insert(attachment.id) },
            box: box,
            tiles: isPending ? nil : tiles
        )
    }

    /// The file card's 42pt thumbnail sits 8pt inside the card, concentric with it.
    private static let thumbnailRadius = HausRadius.nested(in: HausRadius.medium, inset: 8)

    private func attachmentRow(_ attachment: MessageAttachmentPresentation) -> some View {
        HStack(spacing: 10) {
            attachmentMedia(attachment)
                .frame(width: 42, height: 42)
                .background(.quaternary, in: .haus(Self.thumbnailRadius))
                .clipShape(.haus(Self.thumbnailRadius))

            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.filename)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                Text(attachmentDetail(attachment))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            if loadingAttachmentID == attachment.id {
                ProgressView().controlSize(.small)
            } else {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(8)
        .frame(maxWidth: 320, alignment: .leading)
        .background(HausPlatformColor.inputSurface, in: .haus(HausRadius.medium))
    }

    @ViewBuilder
    private func attachmentMedia(_ attachment: MessageAttachmentPresentation) -> some View {
        if attachment.isImage, let localURL = attachment.localURL {
            LocalAttachmentImage(url: localURL)
        } else {
            HausIcon(attachmentIcon(attachment), size: 19, weight: 1.6)
                .foregroundStyle(.secondary)
        }
    }

    /// An image tile opens on the frame of the tap: the viewer paints the
    /// bitmap this tile already decoded and resolves the file itself, so there
    /// is nothing to wait for. A file row still has to reach its bytes before
    /// Quick Look has anything to show. Either way the resolved URL is owned by
    /// the caller's attachment cache and outlives the preview, so dismissal
    /// deletes nothing.
    private func open(_ attachment: MessageAttachmentPresentation) {
        // A send in flight has nothing durable to open yet. Its row takes the
        // tap and does nothing rather than drawing a disabled state the
        // confirmed row would then drop.
        guard !isPending else { return }
        if layout.images.contains(where: { $0.id == attachment.id }) {
            preview = .image(attachmentID: attachment.id)
            return
        }
        loadingAttachmentID = attachment.id
        Task {
            do {
                preview = .file(try await onOpen(attachment))
            } catch is CancellationError {
                // A dismissed preview or canceled transfer needs no error UI.
            } catch {
                preview = .failure(error.localizedDescription)
            }
            loadingAttachmentID = nil
        }
    }

    private func attachmentDetail(_ attachment: MessageAttachmentPresentation) -> String {
        let size = ByteCountFormatter.string(
            fromByteCount: Int64(attachment.sizeBytes),
            countStyle: .file
        )
        let kind = attachment.mediaType.split(separator: "/").last.map(String.init) ?? "file"
        return "\(kind.uppercased()) · \(size)"
    }

    private func attachmentIcon(_ attachment: MessageAttachmentPresentation) -> HausIconName {
        if attachment.mediaType == "application/pdf" { return .pdf }
        if attachment.mediaType.hasPrefix("video/") { return .video }
        if attachment.mediaType.hasPrefix("audio/") { return .voice }
        if attachment.isImage { return .image }
        return .document
    }
}

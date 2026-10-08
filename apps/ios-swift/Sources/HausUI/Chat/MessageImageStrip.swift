import SwiftUI

/// A message's two-or-more images, side by side as one row of squares.
///
/// Stacked hero tiles turned a couple of small PNGs into a wall of picture and
/// blew each one up to fill it. As uniform fill-cropped squares they read as
/// one attachment group at a glance, the message keeps its place in the
/// transcript, and the pictures stay the size they were.
///
/// The row is exactly one square tall and never grows: past about three, the
/// squares scroll sideways inside it. The horizontal scroll is safe inside the
/// transcript for the same structural reason the viewer's zoom is safe inside
/// the pager — with `.basedOnSize` a strip that fits does not bounce, so its
/// pan never begins and the table's vertical drag and long press see an
/// untouched hierarchy. The cell's content view is flipped on Y, which leaves
/// horizontal direction, momentum, and hit-testing exactly as they are.
struct MessageImageStrip: View {
    let attachments: [MessageAttachmentPresentation]
    let isDisabled: Bool
    let onOpen: (MessageAttachmentPresentation) async throws -> URL
    let onFailure: (MessageAttachmentPresentation) -> Void
    let onTap: (MessageAttachmentPresentation) -> Void
    var tiles: AttachmentImageTileRegistry?

    /// The message column, measured. The square follows the column rather than
    /// a constant, and the default is within a point or two of every current
    /// iPhone, so the first frame is drawn at the size the measurement then
    /// confirms.
    @State private var columnWidth = CGFloat.zero

    var body: some View {
        let side = AttachmentImageStripSize.square(columnWidth: columnWidth)
        ScrollView(.horizontal) {
            HStack(spacing: AttachmentImageStripSize.gap) {
                ForEach(attachments) { attachment in
                    square(attachment, side: side)
                }
            }
        }
        .frame(height: side)
        .scrollIndicators(.hidden)
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { columnWidth = $0 }
    }

    private func square(_ attachment: MessageAttachmentPresentation, side: CGFloat) -> some View {
        Button {
            onTap(attachment)
        } label: {
            AttachmentImageTile(
                attachment: attachment,
                onOpen: onOpen,
                onFailure: { onFailure(attachment) },
                box: .square(side),
                tiles: tiles
            )
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .accessibilityLabel("Preview \(attachment.filename)")
    }
}

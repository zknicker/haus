import SwiftUI

/// A compact card for one ```artifact page under the message that linked it —
/// the App's `WidgetArtifactCard`: a document glyph in its own box, the page's
/// title over `Page · path`, and a trailing chevron. The card reads nothing;
/// tapping it opens the page in a sheet, which reads it from the Agent's
/// workspace then.
struct ArtifactCard: View {
    let artifact: ArtifactSegment
    /// The Agent whose workspace holds the page: the message's author.
    let agentID: String

    @ScaledMetric(relativeTo: .subheadline) private var markSize: CGFloat = 36

    var body: some View {
        Button {
            ArtifactPagePresenter.present(artifact, agentID: agentID)
        } label: {
            HStack(spacing: 12) {
                HausIcon(.document, size: markSize * 0.45)
                    .foregroundStyle(.secondary)
                    .frame(width: markSize, height: markSize)
                    .background(
                        HausPlatformColor.label.opacity(0.05),
                        in: .haus(HausRadius.mark(side: markSize))
                    )
                VStack(alignment: .leading, spacing: 1) {
                    Text(artifact.displayTitle)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                    Text("Page · \(artifact.path)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                HausPlatformColor.label.opacity(0.035),
                in: .haus(Self.cornerRadius)
            )
            .overlay {
                RoundedRectangle.haus(Self.cornerRadius)
                    .strokeBorder(HausPlatformColor.separator.opacity(0.6), lineWidth: 0.5)
            }
            .frame(maxWidth: 420, alignment: .leading)
            .contentShape(.haus(Self.cornerRadius))
        }
        .buttonStyle(.pressableRow(cornerRadius: Self.cornerRadius))
        .accessibilityLabel("Page: \(artifact.displayTitle)")
        .accessibilityHint("Opens the page.")
    }

    static let cornerRadius: CGFloat = HausRadius.medium
}

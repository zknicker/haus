import HausModels
import SwiftUI

#if os(iOS)
import UIKit

/// One shared-library artifact, full height in a sheet: a header naming the
/// file, who created it, and when it last changed, then the file itself. Both
/// reads start when the sheet opens; the header lands with the metadata and the
/// preview with the bytes. Blank while loading, and a calm unavailable state,
/// with Try Again where it could help, when either read fails.
struct SharedArtifactSheet: View {
    let target: SharedArtifactLinkTarget
    let onDone: () -> Void

    @State private var metadata: Result<SharedArtifactMetadata, SharedArtifactUnavailable>?
    @State private var file: Result<URL, SharedArtifactUnavailable>?
    @State private var attempt = 0

    var body: some View {
        NavigationStack {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.background)
                // The header names the file; a bar title would say it twice.
                .hausInlineNavigationTitle()
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done", action: onDone)
                    }
                    if case .success(let url) = file {
                        ToolbarItem(placement: .topBarLeading) {
                            ShareLink(item: url) {
                                Label("Share", systemImage: "square.and.arrow.up")
                            }
                        }
                    }
                }
        }
        .task(id: attempt) {
            let loaded = await SharedArtifactReader.loadMetadata(target)
            metadata = loaded
            guard case .success(let artifact) = loaded else { return }
            file = await SharedArtifactReader.loadFile(artifact)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch metadata {
        case nil:
            Color.clear
        case .failure(let reason):
            unavailable(reason)
        case .success(let artifact):
            VStack(spacing: 0) {
                SharedArtifactHeader(artifact: artifact)
                Divider()
                preview(artifact)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .transition(.opacity)
        }
    }

    @ViewBuilder
    private func preview(_ artifact: SharedArtifactMetadata) -> some View {
        switch file {
        case nil:
            Color.clear
        case .failure(let reason):
            unavailable(reason)
        case .success(let url):
            SharedArtifactPreview(artifact: artifact, file: url)
                .transition(.opacity)
        }
    }

    private func unavailable(_ reason: SharedArtifactUnavailable) -> some View {
        ContentUnavailableView {
            Label(reason.title, systemImage: "doc")
        } description: {
            Text(reason.message)
        } actions: {
            if reason.isRetryable {
                Button("Try Again") {
                    metadata = nil
                    file = nil
                    attempt += 1
                }
                .buttonStyle(.bordered)
            }
        }
    }
}

/// The file's kind mark, its title, and who last left it how — the App
/// viewer's header without the menu, whose Download is the share button here.
struct SharedArtifactHeader: View {
    let artifact: SharedArtifactMetadata

    var body: some View {
        HStack(spacing: 12) {
            HausIcon(artifact.fileKind.glyph, size: 22)
                .foregroundStyle(.secondary)
                .frame(width: 40, height: 40)
                .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(artifact.title)
                    .font(.headline)
                    .lineLimit(2)
                byline
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
    }

    /// `Blippy · Updated 5 minutes ago`. A creator the App cannot name is
    /// left out rather than guessed.
    private var byline: Text {
        let updated = artifact.updatedAt.formatted(.relative(presentation: .named))
        guard let name = SharedArtifactReader.creatorName?(artifact.creator) else {
            return Text(verbatim: "Updated \(updated)")
        }
        return Text(verbatim: "\(name) · Updated \(updated)")
    }
}

/// Puts a shared artifact on screen from wherever its chip was tapped, the way
/// `ArtifactPagePresenter` presents a workspace page: transcript rows own no
/// view controller, so the frontmost controller presents the sheet.
@MainActor
enum SharedArtifactPresenter {
    static func present(_ target: SharedArtifactLinkTarget) {
        guard let presenter = ArtifactPagePresenter.frontmostController() else { return }
        weak var sheet: UIViewController?
        let controller = UIHostingController(
            rootView: SharedArtifactSheet(target: target) {
                sheet?.dismiss(animated: true)
            }
        )
        sheet = controller
        controller.modalPresentationStyle = .pageSheet
        controller.sheetPresentationController?.prefersGrabberVisible = true
        presenter.present(controller, animated: true)
    }
}
#else
@MainActor
enum SharedArtifactPresenter {
    static func present(_ target: SharedArtifactLinkTarget) {}
}
#endif

import HausModels
import SwiftUI

/// The Drive reads a file preview needs, installed by the App.
public struct DriveFileReads {
    /// `artifact.text` for the listed revision.
    public let text: (ArtifactRecord) async throws -> ArtifactTextResult
    /// The listed revision's bytes as a local file (`artifact.download`).
    public let file: (SharedArtifactMetadata) async throws -> URL

    public init(
        text: @escaping (ArtifactRecord) async throws -> ArtifactTextResult,
        file: @escaping (SharedArtifactMetadata) async throws -> URL
    ) {
        self.text = text
        self.file = file
    }
}

/// What a Drive file preview settled on.
enum DriveFilePreviewState: Equatable {
    case page(String)
    case text(String, monospaced: Bool)
    case file(URL)
    case unavailable(SharedArtifactUnavailable)
}

/// One Drive file, previewed at the revision the listing returned: HTML on the
/// sandboxed page canvas, text as text, and anything else in the shared file
/// preview. Text too large or not text after all falls back to the file.
public struct DriveFileView: View {
    private let file: DriveFilePresentation
    private let reads: DriveFileReads

    @State private var state: DriveFilePreviewState?
    @State private var attempt = 0
    @Environment(\.colorScheme) private var colorScheme

    public init(file: DriveFilePresentation, reads: DriveFileReads) {
        self.file = file
        self.reads = reads
    }

    public var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(HausPlatformColor.canvas)
            .inlineNavigationTitle(file.filename, subtitle: subtitle)
            .task(id: LoadKey(revisionID: file.metadata.revisionID, attempt: attempt)) {
                state = nil
                state = await load()
            }
    }

    private var subtitle: String {
        [file.folder.isEmpty ? nil : file.folder, file.revisionLabel].compactMap { $0 }.joined(separator: " · ")
    }

    @ViewBuilder
    private var content: some View {
        switch state {
        case nil:
            Color.clear
        case .page(let html):
            page(html)
        case .text(let text, let monospaced):
            ScrollView {
                Text(verbatim: text)
                    .font(monospaced ? .system(.callout, design: .monospaced) : .body)
                    .foregroundStyle(HausPlatformColor.ink)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(20)
            }
        case .file(let url):
            filePreview(url)
        case .unavailable(let reason):
            ContentUnavailableView {
                Label(reason.title, systemImage: "doc")
            } description: {
                Text(reason.message)
            } actions: {
                if reason.isRetryable {
                    Button("Try Again") { attempt += 1 }
                        .buttonStyle(.bordered)
                }
            }
        }
    }

    private func load() async -> DriveFilePreviewState? {
        do {
            switch file.preview {
            case .page, .text:
                switch try await reads.text(file.record) {
                case .text(let text):
                    if case .text(let monospaced) = file.preview { return .text(text, monospaced: monospaced) }
                    return .page(text)
                case .tooLarge, .binary:
                    return .file(try await reads.file(file.metadata))
                }
            case .file:
                return .file(try await reads.file(file.metadata))
            }
        } catch is CancellationError {
            return nil
        } catch let unavailable as SharedArtifactUnavailable {
            return .unavailable(unavailable)
        } catch {
            return .unavailable(.failed)
        }
    }

    @ViewBuilder
    private func page(_ html: String) -> some View {
        #if canImport(UIKit)
        VisualWebView(
            document: ArtifactPageDocument.make(html: html, scheme: colorScheme == .light ? .light : .dark),
            scrolls: true,
            onHeight: { _ in }
        )
        .accessibilityLabel(file.filename)
        #else
        Color.clear
        #endif
    }

    @ViewBuilder
    private func filePreview(_ url: URL) -> some View {
        #if os(iOS)
        SharedArtifactPreview(artifact: file.metadata, file: url)
        #else
        Color.clear
        #endif
    }
}

private struct LoadKey: Equatable {
    let revisionID: String
    let attempt: Int
}

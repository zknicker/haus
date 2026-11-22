import SwiftUI

/// A pushed screen for one Server record: the freshest record held, blank
/// while its read runs, and the read's failure once it fails with nothing held.
public struct RouteRecordView<Record, Content: View>: View {
    private let record: Record?
    private let key: String
    private let unavailableTitle: String
    private let load: () async throws -> Void
    private let content: (Record) -> Content

    @State private var failure: String?

    public init(
        record: Record?,
        key: String,
        unavailableTitle: String,
        load: @escaping () async throws -> Void,
        @ViewBuilder content: @escaping (Record) -> Content
    ) {
        self.record = record
        self.key = key
        self.unavailableTitle = unavailableTitle
        self.load = load
        self.content = content
    }

    public var body: some View {
        Group {
            if let record {
                content(record)
            } else if let failure {
                ContentUnavailableView(unavailableTitle, systemImage: "exclamationmark.triangle", description: Text(failure))
            } else {
                Color.clear
            }
        }
        .task(id: key) {
            failure = nil
            do {
                try await load()
            } catch is CancellationError {
                return
            } catch {
                failure = error.localizedDescription
            }
        }
    }
}

import HausModels
import SwiftUI

/// The App-layer seam for an Agent profile's stopped claims, shared by the
/// profile Chat details pushes and the one Settings edits.
public struct AgentStoppedClaimsActions: Sendable {
    /// One `claim.list`, sliced to this Agent.
    public let load: @MainActor @Sendable (_ agentID: String) async throws -> [ClaimListItem]
    /// Opens the claim's Thread. The profile's sheet closes as it does.
    public let open: @MainActor @Sendable (ClaimListItem) -> Void

    public init(
        load: @escaping @MainActor @Sendable (String) async throws -> [ClaimListItem],
        open: @escaping @MainActor @Sendable (ClaimListItem) -> Void
    ) {
        self.load = load
        self.open = open
    }

    /// A profile with no claim read behind it, as in previews.
    public static let unavailable = AgentStoppedClaimsActions(load: { _ in [] }, open: { _ in })
}

/// What a profile knows about the claims. Nothing renders until the read
/// settles, and a settled empty read renders nothing either: an Agent that left
/// nothing unfinished has no section to show.
enum AgentStoppedClaimsState: Equatable {
    case loading
    case loaded([ClaimListItem])
    case failed(String)

    var claims: [ClaimListItem] {
        if case .loaded(let claims) = self { claims } else { [] }
    }

    var failure: String? {
        if case .failed(let message) = self { message } else { nil }
    }
}

extension View {
    /// Reads the Agent's stopped claims once the profile is on screen.
    func loadsStoppedClaims(
        agentID: String,
        actions: AgentStoppedClaimsActions,
        into state: Binding<AgentStoppedClaimsState>
    ) -> some View {
        task(id: agentID) {
            do {
                state.wrappedValue = .loaded(try await actions.load(agentID))
            } catch is CancellationError {
                return
            } catch {
                guard !Task.isCancelled else { return }
                state.wrappedValue = .failed(error.localizedDescription)
            }
        }
    }
}

extension ClaimListItem {
    /// The request the Agent took, on one line.
    var stoppedClaimTitle: String {
        let line = RichMessageParser.oneLinePreview(message.content)
        return line.isEmpty ? "Attachment" : line
    }

    /// `#product · 2h`: where it is, and how long it has sat. A DM is `DM`,
    /// never its peer.
    func stoppedClaimDetail(now: Date) -> String {
        let place = switch chatKind {
        case .channel: "#\(chatName ?? "channel")"
        case .dm: "DM"
        }
        return "\(place) · \(HausCompactRelativeTime.label(for: claim.updatedAt, now: now))"
    }
}

/// The section as a List draws it, on the read-only profile.
struct AgentStoppedClaimsSection: View {
    let state: AgentStoppedClaimsState
    let onOpen: (ClaimListItem) -> Void

    var body: some View {
        if let failure = state.failure {
            Section(StoppedClaims.title) {
                Label(failure, systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        } else if !state.claims.isEmpty {
            Section {
                ForEach(state.claims) { item in
                    Button { onOpen(item) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.stoppedClaimTitle)
                                .font(.subheadline)
                                .foregroundStyle(.primary)
                                .lineLimit(3)
                            Text(item.stoppedClaimDetail(now: .now))
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            } header: {
                TaskSectionTitle(title: StoppedClaims.title, count: state.claims.count)
            }
        }
    }
}

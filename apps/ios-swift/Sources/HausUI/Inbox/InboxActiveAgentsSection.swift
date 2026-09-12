import SwiftUI

/// The Agents worth looking at right now, as a scrolling row of week cards.
///
/// The strip is the page's only section whose body is not a box: cards already
/// carry their own edges, and wrapping them would put a border around borders.
/// It renders nothing at all while the usage read is unsettled — a strip ranked
/// against a half-loaded window would reorder under the reader.
struct InboxActiveAgentsSection: View {
    let weeks: [InboxAgentWeek]?
    let onOpen: (InboxOpenRequest) -> Void

    var body: some View {
        if let weeks {
            InboxSectionView(title: "Active this week") {
                if weeks.isEmpty {
                    Text("No Agent activity this week.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, InboxMetrics.pageInset)
                } else {
                    ScrollView(.horizontal) {
                        HStack(spacing: 12) {
                            ForEach(weeks) { week in
                                InboxAgentWeekCard(week: week) { onOpen(.agent(week.id)) }
                            }
                        }
                        .padding(.horizontal, InboxMetrics.pageInset)
                        .padding(.vertical, 1)
                    }
                    .scrollIndicators(.hidden)
                }
            }
        }
    }
}

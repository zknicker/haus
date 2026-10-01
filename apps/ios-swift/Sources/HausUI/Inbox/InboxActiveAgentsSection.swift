import SwiftUI

/// The Agents worth looking at right now, as a scrolling row of week cards.
///
/// The strip is the page's only section whose body is not on the grouped
/// surface: cards already carry their own edges, and a surface behind them
/// would put a border around borders. It renders nothing at all while the
/// usage read is unsettled — a strip ranked against a half-loaded window would
/// reorder under the reader.
struct InboxActiveAgentsSection: View {
    let weeks: [InboxAgentWeek]?
    let onOpen: (InboxOpenRequest) -> Void

    var body: some View {
        if let weeks {
            InboxSectionView(title: "Active this week") {
                Group {
                    if weeks.isEmpty {
                        Text("No Agent activity this week.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, InboxMetrics.rowInset)
                    } else {
                        ScrollView(.horizontal) {
                            HStack(alignment: .top, spacing: 12) {
                                ForEach(weeks) { week in
                                    InboxAgentWeekCard(week: week) { onOpen(.agent(week.id)) }
                                }
                            }
                            .padding(.vertical, 1)
                        }
                        .scrollIndicators(.hidden)
                        // The strip lives inside the section's inset column but
                        // scrolls past it to the screen's edge, so a card leaving
                        // the column is cut by the glass, not by the List's margin.
                        .scrollClipDisabled()
                    }
                }
                .inboxBareRow()
            }
        }
    }
}

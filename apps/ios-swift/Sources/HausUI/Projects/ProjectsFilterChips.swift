import SwiftUI

/// "Joined ⌄" picks the scope; "+ Filter" narrows to one Captain's Projects.
struct ProjectsFilterChips: View {
    @Binding var filter: ProjectsFilter
    let captains: [CaptainIdentity]

    var body: some View {
        FilterChipRow {
            Menu {
                Picker("Show", selection: $filter.scope) {
                    ForEach(ProjectsFilter.Scope.allCases, id: \.self) { scope in
                        Text(scope.rawValue).tag(scope)
                    }
                }
            } label: {
                FilterChip(filter.scope.rawValue, isSelected: true, accessory: .menu) {}
            }
            if !captains.isEmpty {
                Menu {
                    Picker("Captain", selection: $filter.captainID) {
                        Text("Any Captain").tag(String?.none)
                        ForEach(captains) { captain in
                            Text(captain.name).tag(String?.some(captain.id))
                        }
                    }
                } label: {
                    FilterChip(captainLabel, isSelected: filter.captainID != nil, accessory: captainAccessory) {}
                }
            }
        }
    }

    private var captainLabel: String {
        guard let captainID = filter.captainID else { return "Filter" }
        return captains.first { $0.id == captainID }?.name ?? "Filter"
    }

    private var captainAccessory: FilterChip.Accessory {
        filter.captainID == nil ? .add : .menu
    }
}

import HausModels
import SwiftUI

/// A Project's repositories: each with the Devices it is checked out on,
/// a menu to link or unlink a Device, swipe to remove, and a field to add one.
struct ProjectReposSection: View {
    let project: Project
    let devices: [ProjectSettingsDevice]
    let actions: ProjectSettingsActions

    @State private var repoDraft = ""
    @State private var error: String?

    var body: some View {
        Section {
            ForEach(project.repos) { repo in
                repoRow(repo)
                    .swipeActions(edge: .trailing) {
                        Button("Remove", systemImage: "trash", role: .destructive) {
                            perform { try await actions.removeRepo(repo.id) }
                        }
                    }
            }
            HStack {
                TextField("owner/repository", text: $repoDraft)
                    .hausHandleInput()
                    .onSubmit(addRepo)
                Button("Add", action: addRepo)
                    .disabled(repoDraft.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        } header: {
            Text("Repositories")
        } footer: {
            Text(error ?? "Link a repository to each Device that has it checked out.")
                .foregroundStyle(error == nil ? HausPlatformColor.mutedInk : HausPlatformColor.critical)
        }
    }

    private func repoRow(_ repo: ProjectRepo) -> some View {
        Menu {
            ForEach(devices) { device in
                if repo.links.contains(where: { $0.computerID == device.id }) {
                    Button("Unlink \(device.name)", systemImage: "link.badge.minus") {
                        perform { try await actions.unlinkRepo(repo.id, device.id) }
                    }
                } else {
                    Button("Link \(device.name)", systemImage: "link.badge.plus") {
                        perform { try await actions.linkRepo(repo.id, device.id) }
                    }
                }
            }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(repo.repository)
                    .foregroundStyle(HausPlatformColor.ink)
                Text(Self.linksLine(repo.links))
                    .font(.subheadline)
                    .foregroundStyle(HausPlatformColor.mutedInk)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
        }
        .disabled(devices.isEmpty)
    }

    private func addRepo() {
        let repository = repoDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !repository.isEmpty else { return }
        perform {
            try await actions.addRepo(repository)
            repoDraft = ""
        }
    }

    private func perform(_ write: @escaping () async throws -> Void) {
        Task {
            do {
                try await write()
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    nonisolated static func linksLine(_ links: [ProjectRepoLink]) -> String {
        let names = links.map { $0.computerName ?? "A Device" }
        return names.isEmpty ? "Not on any Device" : names.joined(separator: ", ")
    }
}

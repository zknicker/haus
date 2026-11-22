import SwiftUI

/// A pull request in a plain list: the state-toned PR glyph, the title, then
/// the author's mark and `haus#441 · +38 −612 · 1d`.
struct PullRequestRow: View {
    let pullRequest: PullRequestPresentation
    let now: Date

    var body: some View {
        WorkListRow(title: pullRequest.title) {
            HausIcon(.pullRequest, size: 16, weight: 1.8)
                .foregroundStyle(pullRequest.tone.color)
        } meta: {
            if let author = pullRequest.context.author {
                CaptainMark(name: author.captainName, tint: author.tint, side: 16)
            }
            PullRequestMetaText(pieces: pullRequest.metaPieces(now: now))
        }
    }
}

/// The meta pieces joined by dots, with the diffstat drawn green and red.
struct PullRequestMetaText: View {
    let pieces: [PullRequestMetaPiece]

    var body: some View {
        pieces.enumerated().reduce(Text(verbatim: "")) { line, entry in
            let separator = entry.offset == 0 ? Text(verbatim: "") : Text(verbatim: " · ")
            return Text("\(line)\(separator)\(text(entry.element))")
        }
    }

    private func text(_ piece: PullRequestMetaPiece) -> Text {
        switch piece {
        case .reference(let value), .status(let value), .age(let value):
            Text(verbatim: value)
        case .diffstat(let diffstat):
            PullRequestDiffstatText(diffstat: diffstat).text
        }
    }
}

/// `+38 −612` in the positive and critical tones.
struct PullRequestDiffstatText {
    let diffstat: PullRequestDiffstat

    var text: Text {
        let additions = Text(verbatim: diffstat.additionsText).foregroundStyle(HausPlatformColor.positive)
        let deletions = Text(verbatim: diffstat.deletionsText).foregroundStyle(HausPlatformColor.critical)
        return Text("\(additions) \(deletions)")
    }
}

/// Tappable pull request rows. The Work view lists them flat under All and
/// grouped Ready, Waiting on checks, and Draft under its Pull requests filter.
struct PullRequestRows: View {
    let pullRequests: [PullRequestPresentation]
    let now: Date
    let onOpen: (PullRequestPresentation) -> Void

    var body: some View {
        ForEach(pullRequests) { pullRequest in
            Button {
                onOpen(pullRequest)
            } label: {
                PullRequestRow(pullRequest: pullRequest, now: now)
            }
            .buttonStyle(.pressableRow)
        }
    }
}

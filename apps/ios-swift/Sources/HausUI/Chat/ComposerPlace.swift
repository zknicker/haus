/// The kind of place a composer writes into, which sets its placeholder.
public enum ComposerPlace: Equatable, Sendable {
    /// A Captain DM, which uses the assistant layout.
    case captain
    case task
    case project(name: String)
    /// A DM with a person.
    case person(name: String)
    /// A conversation's composer sending to the Task beside it.
    case steeringTask

    public var placeholder: String {
        switch self {
        case .captain, .task: "Reply"
        case .project(let name): "Message #\(name)"
        case .person(let name): "Message \(name)"
        case .steeringTask: "Steer the Task"
        }
    }
}

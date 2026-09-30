import Foundation

public enum VoiceCallEvent: Equatable, Sendable, Decodable {
    case ready(agentName: String)
    case audio(Data)
    case transcript(speaker: String, text: String)
    case failure(String)
    case closed

    private enum CodingKeys: String, CodingKey { case type, agentName, audio, speaker, text, message }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        switch try values.decode(String.self, forKey: .type) {
        case "ready": self = .ready(agentName: try values.decode(String.self, forKey: .agentName))
        case "audio":
            let encoded = try values.decode(String.self, forKey: .audio)
            guard let bytes = Data(base64Encoded: encoded), !bytes.isEmpty, bytes.count.isMultiple(of: 2) else {
                throw DecodingError.dataCorruptedError(forKey: .audio, in: values, debugDescription: "Invalid PCM16 audio")
            }
            self = .audio(bytes)
        case "transcript": self = .transcript(
            speaker: try values.decode(String.self, forKey: .speaker),
            text: try values.decode(String.self, forKey: .text)
        )
        case "error": self = .failure(try values.decode(String.self, forKey: .message))
        case "closed": self = .closed
        default: throw DecodingError.dataCorruptedError(forKey: .type, in: values, debugDescription: "Unknown voice event")
        }
    }
}

public enum VoiceCallCommand: Sendable, Encodable {
    case audio(Data)
    case mute(Bool)
    case close

    private enum CodingKeys: String, CodingKey { case type, audio, muted }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .audio(let data):
            try values.encode("audio", forKey: .type)
            try values.encode(data.base64EncodedString(), forKey: .audio)
        case .mute(let muted):
            try values.encode("mute", forKey: .type)
            try values.encode(muted, forKey: .muted)
        case .close: try values.encode("close", forKey: .type)
        }
    }
}

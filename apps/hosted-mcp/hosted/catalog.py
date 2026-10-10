"""Read-only Skool account tools. Communities are selected within account access."""

from mcp.types import Tool, ToolAnnotations


def tool(name: str, description: str, properties: dict, required: list[str] | None = None) -> Tool:
    if name != "skool_list_communities":
        properties = {"community_slug": {"type": "string", "pattern": "^[a-z0-9-]{1,100}$"},
                      **properties}
        required = ["community_slug", *(required or [])]
    return Tool(name=name, description=description,
                inputSchema={"type": "object", "properties": properties,
                             "required": required or [], "additionalProperties": False},
                annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False,
                                            openWorldHint=True))


POST = {"type": "string", "pattern": "^[a-zA-Z0-9-]{1,250}$"}
TOOLS = [
    tool("skool_list_communities", "List communities joined or owned by the connected Skool account. "
         "Start here to discover community_slug values for other tools.", {}),
    tool("skool_list_posts", "Read recent posts in a community accessible to the connected Skool account.",
         {"limit": {"type": "integer", "minimum": 1, "maximum": 25}}),
    tool("skool_search_posts", "Search posts in an accessible Skool community.",
         {"query": {"type": "string", "minLength": 1, "maxLength": 200},
          "page": {"type": "integer", "minimum": 1, "maximum": 100}}, ["query"]),
    tool("skool_get_post", "Read a post by its URL slug in an accessible Skool community.",
         {"post_name": POST}, ["post_name"]),
    tool("skool_get_comments", "Read comments on a post by its URL slug.",
         {"post_name": POST}, ["post_name"]),
    tool("skool_get_classroom", "List courses and access in an accessible Skool community.", {}),
    tool("skool_get_course", "Read an accessible course listed by skool_get_classroom.",
         {"course_id": POST}, ["course_id"]),
    tool("skool_get_calendar", "Read an accessible Skool community calendar.", {}),
    tool("skool_get_video_transcript", "Read available captions on a native Skool video post. "
         "External YouTube embeds and videos without captions may be unavailable.",
         {"post_name": POST}, ["post_name"]),
]
BY_NAME = {entry.name: entry for entry in TOOLS}


def validate(name: str, arguments: dict) -> None:
    from jsonschema import validate as validate_schema

    if name not in BY_NAME:
        raise ValueError("Unknown tool")
    validate_schema(arguments, BY_NAME[name].input_schema)

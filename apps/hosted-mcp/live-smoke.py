"""Explicit private-account read test. Prints counts, never private post contents."""

import argparse
import asyncio
import json
import logging
from pathlib import Path

from httpx2 import AsyncClient
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client


async def main(path: Path, community: str | None) -> None:
    config = json.loads(path.read_text())
    async with AsyncClient(headers=config["headers"], timeout=30) as http:
        status_url = config["url"].removesuffix("/mcp") + "/status"
        before = (await http.get(status_url)).json()
        async with streamable_http_client(config["url"], http_client=http) as streams:
            async with ClientSession(*streams) as client:
                await client.initialize()
                tools = await client.list_tools()
                assert len(tools.tools) == 9
                after_discovery = (await http.get(status_url)).json()
                assert before["starts"] == after_discovery["starts"]

                async def call(name, arguments):
                    result = await client.call_tool(name, arguments)
                    if result.is_error:
                        raise RuntimeError(f"{name} failed: {result.content}")
                    return json.loads(result.content[0].text)

                communities = await call("skool_list_communities", {})
                assert communities
                slug = community or communities[0]["slug"]
                assert slug in {entry["slug"] for entry in communities}
                scope = {"community_slug": slug}
                posts = await call("skool_list_posts", {**scope, "limit": 3})
                assert len(posts) == 3
                post = await call("skool_get_post", {**scope, "post_name": posts[0]["name"]})
                assert post["title"] == posts[0]["title"]
                comments = await call("skool_get_comments", {**scope, "post_name": posts[0]["name"]})
                search = await call("skool_search_posts", {**scope, "query": "Amazon"})
                classroom = await call("skool_get_classroom", scope)
                course = next(c for c in classroom["courses"] if c["has_access"])
                tree = await call("skool_get_course", {**scope, "course_id": course["id"]})
                calendar = await call("skool_get_calendar", scope)
                print(json.dumps({"tools": len(tools.tools), "communities": len(communities), "posts": len(posts),
                                  "comments": len(comments), "search_type": type(search).__name__,
                                  "courses": len(classroom["courses"]),
                                  "course_type": type(tree).__name__, "calendar_type": type(calendar).__name__,
                                  "pool": (await http.get(status_url)).json()}))


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING, force=True)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("connection", type=Path)
    parser.add_argument("--community")
    options = parser.parse_args()
    asyncio.run(main(options.connection, options.community))

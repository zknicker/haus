"""Scoped calls into pinned Catknows. One instance per account process."""

import catknows.mcp_server as upstream
from catknows import Session, SkoolClient


class Skool:
    def __init__(self, record: dict):
        upstream._client = SkoolClient(Session(**record["session"]))

    def call(self, name: str, arguments: dict):
        communities = upstream.list_my_communities()
        if name == "skool_list_communities":
            return communities
        slug = arguments["community_slug"]
        if slug not in {community["slug"] for community in communities}:
            raise ValueError("Community is outside connected Skool account access")
        if name == "skool_list_posts":
            return upstream.list_posts(slug, limit=arguments.get("limit", 10))
        if name == "skool_search_posts":
            return upstream.search_community(slug, arguments["query"], kind="posts",
                                             page=arguments.get("page", 1))
        if name == "skool_get_classroom":
            return upstream.get_classroom(slug)
        if name == "skool_get_calendar":
            return upstream.get_calendar(slug)
        if name == "skool_get_course":
            courses = upstream.get_classroom(slug)["courses"]
            allowed = {course["id"] for course in courses if course["has_access"]}
            if arguments["course_id"] not in allowed:
                raise ValueError("Course is outside selected community access")
            return upstream.get_course_tree(arguments["course_id"], community_slug=slug)
        post_name = arguments["post_name"]
        post = upstream.get_post(slug, post_name)
        group_id = upstream._client.group_id_for(slug)
        if post["group_id"] != group_id:
            raise ValueError("Post is outside selected community")
        if name == "skool_get_post":
            post["url"] = f"https://www.skool.com/{slug}/{post_name}"
            return post
        if name == "skool_get_comments":
            return upstream.get_post_comments(slug, post["skool_id"])
        if name == "skool_get_video_transcript":
            return upstream.get_video_transcript(slug, post_name)
        raise ValueError("Unknown tool")

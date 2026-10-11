"""Read classroom lesson pages and their native Mux captions, never playback tokens."""

import json
import re
from urllib.parse import quote, urlencode, urljoin, urlsplit

from catknows import SkoolClient
from catknows.client import _vtt_cues


def read_lesson(client: SkoolClient, slug: str, course_id: str, lesson_id: str) -> dict:
    """Called only after the account's community and course access have been checked."""
    courses = client.classroom(slug).get("pageProps", {}).get("allCourses") or []
    course = next((c for c in courses if c.get("id") == course_id), None)
    if not course or not course.get("name"):
        raise ValueError("Course is absent from selected classroom")
    path = f"/{slug}/classroom/{quote(course['name'], safe='')}.json"
    query = urlencode({"group": slug, "md": lesson_id})
    page = client.http.get_next(f"{path}?{query}", slug).get("pageProps") or {}
    tree = page.get("course") or {}
    if ((page.get("currentGroup") or {}).get("id") != client.group_id_for(slug)
            or (tree.get("course") or {}).get("id") != course_id
            or page.get("selectedModule") != lesson_id):
        raise ValueError("Lesson page is outside selected community or course")
    lesson = find_lesson(tree, lesson_id)
    if lesson is None:
        raise ValueError("Lesson is absent or inaccessible in selected course")
    md = lesson.get("metadata") or {}
    resources = json.loads(md.get("resources") or "[]")
    if not isinstance(resources, list) or any(not isinstance(r, dict) for r in resources):
        raise ValueError("Invalid lesson resources")
    result = {"id": lesson_id, "course_id": course_id, "title": md.get("title", ""),
              "content": md.get("desc", ""),
              "url": f"https://www.skool.com/{slug}/classroom/{quote(course['name'], safe='')}?{urlencode({'md': lesson_id})}",
              "resources": [{k: r[k] for k in ("title", "file_id", "file_name", "file_content_type", "url")
                             if k in r} for r in resources],
              "transcript": "", "cues": []}
    video_id = md.get("videoId") or md.get("video_id")
    video_link = md.get("videoLink") or md.get("video_link")
    if video_link:
        result["video_link"] = video_link
    if md.get("transcript"):
        result.update(transcript=md["transcript"], transcript_status="available")
    elif video_id:
        video = page.get("video") or {}
        if video.get("id") != video_id:
            raise ValueError("Lesson playback details are absent or mismatched")
        result.update(read_captions(client, video))
    else:
        result["transcript_status"] = "external_video" if video_link else "no_video"
    return result


def find_lesson(node: dict, lesson_id: str) -> dict | None:
    """A locked folder blocks descendants even if a child has its own access flag."""
    unit = node.get("course") or {}
    md = unit.get("metadata") or {}
    access = md.get("hasAccess", md.get("has_access"))
    if access is not None and access not in (True, 1):
        return None
    if unit.get("id") == lesson_id:
        if (unit.get("unitType") or unit.get("unit_type")) == "module" and access in (True, 1):
            return unit
        return None
    for child in node.get("children") or []:
        found = find_lesson(child, lesson_id)
        if found is not None:
            return found
    return None


def read_captions(client: SkoolClient, video: dict) -> dict:
    playback = quote(video["playbackId"], safe="")
    master_url = f"https://stream.mux.com/{playback}.m3u8?{urlencode({'token': video['playbackToken']})}"
    master = client.http.get_mux(master_url)
    track = re.search(r'TYPE=SUBTITLES[^\n]*?URI="([^"]+)"', master)
    cues = []
    if track:
        playlist_url = mux_url(master_url, track.group(1))
        playlist = client.http.get_mux(playlist_url)
        segments = [line.strip() for line in playlist.splitlines()
                    if line.strip() and not line.startswith("#")]
        vtt = "\n\n".join(client.http.get_mux(mux_url(playlist_url, segment)) for segment in segments)
        cues = _vtt_cues(vtt)
    return {"video_id": video["id"], "duration_s": round(video["duration"] / 1000, 3),
            "transcript_status": "available" if cues else "no_captions",
            "transcript": " ".join(c["text"] for c in cues), "cues": cues}


def mux_url(base: str, reference: str) -> str:
    url = urljoin(base, reference)
    parsed = urlsplit(url)
    host = parsed.hostname or ""
    if (parsed.scheme != "https" or not host.endswith(".mux.com")
            or parsed.username or parsed.password or parsed.port not in (None, 443)):
        raise ValueError("Caption URL is outside Mux")
    return url

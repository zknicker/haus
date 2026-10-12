import json
import unittest
from unittest.mock import Mock, patch

from hosted.catalog import validate
from hosted.skool import Skool


class LessonTests(unittest.TestCase):
    def setUp(self):
        self.skool = object.__new__(Skool)
        self.client = Mock()
        self.client.classroom.return_value = {"pageProps": {"allCourses": [
            {"id": "course", "name": "course-name"}]}}
        self.lesson = {"id": "lesson", "unitType": "module", "metadata": {
            "title": "Lesson", "hasAccess": 1, "videoId": "video",
            "resources": json.dumps([{"title": "Transcript", "file_id": "file",
                                      "file_name": "transcript.txt"}])}}
        self.page = {"selectedModule": "lesson", "currentGroup": {"id": "group"},
                     "course": {"course": {"id": "course"}, "children": [
                         {"course": self.lesson}]},
                     "video": {"id": "video", "playbackId": "playback",
                               "playbackToken": "private-token", "duration": 10_000}}
        self.client.group_id_for.return_value = "group"
        self.client.http.get_next.return_value = {"pageProps": self.page}
        self.client.http.get_mux.side_effect = [
            '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,URI="https://stream.mux.com/text/track.m3u8"',
            '#EXTM3U\npart1.vtt\npart2.vtt',
            'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nFirst cue.\n\n',
            'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nSecond cue.\n\n']
        for target, value in (
            ("list_my_communities", [{"slug": "community"}]),
            ("get_classroom", {"courses": [{"id": "course", "has_access": True}]}),
            ("_client", self.client),
        ):
            p = patch("hosted.skool.upstream." + target, value if target == "_client" else Mock(return_value=value))
            p.start()
            self.addCleanup(p.stop)

    def read(self):
        args = {"community_slug": "community", "course_id": "course", "lesson_id": "lesson"}
        validate("skool_get_lesson", args)
        return self.skool.call("skool_get_lesson", args)

    def test_reads_lesson_captions_and_resources_without_exposing_playback_tokens(self):
        result = self.read()
        self.assertEqual(result["transcript"], "First cue. Second cue.")
        self.assertEqual(result["transcript_status"], "available")
        self.assertEqual(len(result["cues"]), 2)
        self.assertEqual(result["resources"][0]["file_name"], "transcript.txt")
        self.assertNotIn("private-token", json.dumps(result))
        self.client.http.get_next.assert_called_once_with(
            "/community/classroom/course-name.json?group=community&md=lesson", "community")
        self.assertEqual(self.client.http.get_mux.call_args_list[-1].args[0],
                         "https://stream.mux.com/text/part2.vtt")

    def test_locked_course_rejected_before_lesson_page(self):
        with patch("hosted.skool.upstream.get_classroom", return_value={"courses": []}):
            with self.assertRaises(ValueError):
                self.read()
        self.client.http.get_next.assert_not_called()

    def test_wrong_group_course_or_selected_lesson_rejected_before_captions(self):
        for key, value in (("currentGroup", {"id": "foreign"}),
                           ("course", {"course": {"id": "foreign"}}),
                           ("selectedModule", "another-lesson")):
            with self.subTest(key=key):
                original = self.page[key]
                self.page[key] = value
                with self.assertRaises(ValueError):
                    self.read()
                self.page[key] = original
        self.client.http.get_mux.assert_not_called()

    def test_locked_lesson_or_parent_rejected_before_captions(self):
        self.lesson["metadata"]["hasAccess"] = 0
        with self.assertRaises(ValueError):
            self.read()
        self.lesson["metadata"]["hasAccess"] = 1
        self.page["course"]["children"] = [{"course": {"id": "folder", "metadata": {
            "hasAccess": 0}}, "children": [{"course": self.lesson}]}]
        with self.assertRaises(ValueError):
            self.read()
        self.client.http.get_mux.assert_not_called()

    def test_missing_captions_are_an_explicit_success_state(self):
        self.client.http.get_mux.side_effect = ["#EXTM3U\n"]
        result = self.read()
        self.assertEqual(result["transcript_status"], "no_captions")
        self.assertEqual(result["transcript"], "")

    def test_stored_transcript_needs_no_caption_fetch(self):
        self.lesson["metadata"]["transcript"] = "Stored lesson transcript."
        self.assertEqual(self.read()["transcript"], "Stored lesson transcript.")
        self.client.http.get_mux.assert_not_called()

    def test_caption_fetch_failure_remains_an_error(self):
        self.client.http.get_mux.side_effect = RuntimeError("Caption request failed")
        with self.assertRaises(RuntimeError):
            self.read()

    def test_absent_lesson_access_is_not_assumed(self):
        self.lesson["metadata"].pop("hasAccess")
        with self.assertRaises(ValueError):
            self.read()
        self.client.http.get_mux.assert_not_called()

    def test_external_video_and_text_lesson_need_no_mux_requests(self):
        self.page["video"] = None
        self.lesson["metadata"].pop("videoId")
        self.lesson["metadata"]["videoLink"] = "https://www.youtube.com/watch?v=example"
        self.assertEqual(self.read()["transcript_status"], "external_video")
        self.lesson["metadata"].pop("videoLink")
        self.assertEqual(self.read()["transcript_status"], "no_video")
        self.client.http.get_mux.assert_not_called()

    def test_caption_urls_cannot_target_other_hosts(self):
        self.client.http.get_mux.side_effect = [
            '#EXT-X-MEDIA:TYPE=SUBTITLES,URI="http://127.0.0.1/private"']
        with self.assertRaises(ValueError):
            self.read()
        self.assertEqual(self.client.http.get_mux.call_count, 1)

    def test_missing_or_wrong_video_is_not_reported_as_no_captions(self):
        for video in (None, {"id": "another-video"}):
            self.page["video"] = video
            with self.assertRaises(ValueError):
                self.read()
        self.client.http.get_mux.assert_not_called()

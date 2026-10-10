import unittest
from unittest.mock import patch

from jsonschema import ValidationError

from hosted.catalog import BY_NAME, validate
from hosted.skool import Skool


class ScopeTests(unittest.TestCase):
    def setUp(self):
        self.skool = object.__new__(Skool)
        membership = patch("hosted.skool.upstream.list_my_communities", return_value=[
            {"slug": "private-group"}, {"slug": "another-group"}])
        self.communities = membership.start()
        self.addCleanup(membership.stop)

    def test_catalog_excludes_mutations_and_raw_requests(self):
        self.assertEqual(len(BY_NAME), 9)
        for name in BY_NAME:
            with self.assertRaises(ValidationError):
                validate(name, {"community_slug": "other", "raw": True})
        with self.assertRaises(ValueError):
            validate("create_post", {})
        for arguments in ({"limit": 26}, {"limit": 0}, {"limit": True}):
            with self.assertRaises(ValidationError):
                validate("skool_list_posts", {"community_slug": "private-group", **arguments})
        with self.assertRaises(ValidationError):
            validate("skool_list_posts", {"limit": 1})
        validate("skool_list_communities", {})

    def test_one_account_can_read_multiple_joined_communities(self):
        with patch("hosted.skool.upstream.list_posts") as posts:
            for slug in ("private-group", "another-group"):
                self.skool.call("skool_list_posts", {"community_slug": slug})
                posts.assert_called_with(slug, limit=10)
        self.assertEqual(len(self.skool.call("skool_list_communities", {})), 2)

    def test_foreign_or_left_community_rejected_before_read(self):
        with patch("hosted.skool.upstream.list_posts") as posts:
            with self.assertRaises(ValueError):
                self.skool.call("skool_list_posts", {"community_slug": "foreign"})
            self.communities.return_value = []
            with self.assertRaises(ValueError):
                self.skool.call("skool_list_posts", {"community_slug": "private-group"})
            posts.assert_not_called()

    def test_inaccessible_or_other_group_course_rejected(self):
        with patch("hosted.skool.upstream.get_classroom", return_value={"courses": [
                {"id": "locked", "has_access": False}, {"id": "allowed", "has_access": True}]}), \
                patch("hosted.skool.upstream.get_course_tree") as get_course:
            for course in ("locked", "other"):
                with self.assertRaises(ValueError):
                    self.skool.call("skool_get_course", {"community_slug": "private-group", "course_id": course})
            get_course.assert_not_called()
            self.skool.call("skool_get_course", {"community_slug": "private-group", "course_id": "allowed"})
            get_course.assert_called_once_with("allowed", community_slug="private-group")

    def test_foreign_post_rejected_before_comments_or_transcript(self):
        with patch("hosted.skool.upstream.get_post", return_value={"group_id": "foreign"}), \
                patch("hosted.skool.upstream._client") as client, \
                patch("hosted.skool.upstream.get_post_comments") as comments:
            client.group_id_for.return_value = "ours"
            with self.assertRaises(ValueError):
                self.skool.call("skool_get_comments", {"community_slug": "private-group", "post_name": "post"})
            comments.assert_not_called()

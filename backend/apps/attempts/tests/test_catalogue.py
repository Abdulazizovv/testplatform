"""Public catalogue: only active branches/subjects and published tests, never any answers."""

from apps.content.models import Subject, Test

from .helpers import API, PublicAPITestCase, make_published


class CatalogueTests(PublicAPITestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.pub_a = make_published(cls.subj_a1, "Nashr A")
        cls.pub_b = make_published(cls.subj_b1, "Nashr B")
        cls.draft = Test.objects.create(subject=cls.subj_a1, title="Qoralama", status="draft")
        cls.archived = Test.objects.create(subject=cls.subj_a1, title="Arxiv", status="archived")
        cls.empty_pub = Test.objects.create(subject=cls.subj_a1, title="Savolsiz", status="published")

    def test_branch_list_is_open_paginated_and_active_only(self):
        r = self.anon.get(f"{API}/branches/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["count"], 2)
        self.assertEqual(set(r.json()["results"][0]), {"id", "slug", "name", "address"})
        self.b.is_active = False
        self.b.save()
        slugs = [b["slug"] for b in self.anon.get(f"{API}/branches/").json()["results"]]
        self.assertEqual(slugs, ["a"])
        self.assertEqual(self.anon.get(f"{API}/branches/b/").status_code, 404)
        self.assertEqual(self.anon.get(f"{API}/branches/b/subjects/").status_code, 404)

    def test_subjects_only_with_published_tests(self):
        r = self.anon.get(f"{API}/branches/a/subjects/")
        self.assertEqual([s["slug"] for s in r.json()["results"]], ["math"])  # physics has no tests
        self.assertEqual(r.json()["results"][0]["test_count"], 1)  # draft/archived/empty not counted

    def test_inactive_subject_hidden(self):
        Subject.objects.filter(pk=self.subj_a1.pk).update(is_active=False)
        self.assertEqual(self.anon.get(f"{API}/branches/a/subjects/").json()["count"], 0)
        self.assertEqual(self.anon.get(f"{API}/subjects/{self.subj_a1.id}/tests/").status_code, 404)
        self.assertEqual(self.start(self.pub_a).status_code, 404)

    def test_tests_of_subject_only_published_of_that_subject(self):
        r = self.anon.get(f"{API}/subjects/{self.subj_a1.id}/tests/")
        self.assertEqual([t["title"] for t in r.json()["results"]], ["Nashr A"])
        self.assertEqual(r.json()["results"][0]["question_count"], 2)
        self.assert_no_leak(r)
        # subject of another branch never mixes in
        rb = self.anon.get(f"{API}/subjects/{self.subj_b1.id}/tests/")
        self.assertEqual([t["title"] for t in rb.json()["results"]], ["Nashr B"])

    def test_non_published_tests_are_invisible_and_cannot_start(self):
        for test in (self.draft, self.archived, self.empty_pub):
            self.assertEqual(self.anon.get(f"{API}/tests/{test.id}/").status_code, 404)
            self.assertEqual(self.start(test).status_code, 404)

    def test_test_detail_and_unpublish_hides_it(self):
        r = self.anon.get(f"{API}/tests/{self.pub_a.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["branch"]["slug"], "a")
        self.assertEqual(r.json()["subject"]["slug"], "math")
        self.assert_no_leak(r)
        Test.objects.filter(pk=self.pub_a.pk).update(status="draft")
        self.assertEqual(self.anon.get(f"{API}/tests/{self.pub_a.id}/").status_code, 404)

    def test_inactive_branch_hides_tests(self):
        self.a.is_active = False
        self.a.save()
        self.assertEqual(self.anon.get(f"{API}/tests/{self.pub_a.id}/").status_code, 404)
        self.assertEqual(self.start(self.pub_a).status_code, 404)

    def test_write_methods_not_allowed_on_catalogue(self):
        self.assertEqual(self.anon.post(f"{API}/branches/", {}, format="json").status_code, 405)
        self.assertEqual(self.anon.delete(f"{API}/tests/{self.pub_a.id}/").status_code, 405)

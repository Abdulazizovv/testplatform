import io
import os

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from apps.content.models import MediaAsset

from .helpers import ContentAPITestCase, make_image

URL = "/api/v1/media/"


def upload(client, data, name="x.png", content_type="image/png", **extra):
    return client.post(
        URL, {"file": SimpleUploadedFile(name, data, content_type=content_type), **extra}, format="multipart"
    )


class MediaUploadTests(ContentAPITestCase):
    def test_png_jpeg_webp_accepted(self):
        client = self.as_user(self.teacher_a)
        for fmt, mime in (("PNG", "image/png"), ("JPEG", "image/jpeg"), ("WEBP", "image/webp")):
            r = upload(client, make_image(fmt, color=(len(fmt), 5, 5)), name=f"a.{fmt.lower()}")
            self.assertEqual(r.status_code, 201, r.content)
            self.assertEqual(r.json()["mime"], mime)
            self.assertTrue(r.json()["url"].startswith("/media/uploads/"))
            asset = MediaAsset.objects.get(pk=r.json()["id"])
            self.assertEqual(asset.branch_id, self.a.id)
            self.assertEqual(asset.uploaded_by_id, self.teacher_a.id)
            self.assertTrue(os.path.exists(os.path.join(settings.MEDIA_ROOT, asset.file.name)))
            self.assertEqual(len(asset.sha256), 64)

    def test_filename_is_uuid_not_client_name(self):
        r = upload(self.as_user(self.admin_a), make_image(), name="../../evil name.png")
        self.assertEqual(r.status_code, 201)
        name = r.json()["url"].rsplit("/", 1)[-1]
        self.assertRegex(name, r"^[0-9a-f-]{36}\.png$")

    def test_fake_extension_rejected(self):
        client = self.as_user(self.admin_a)
        # text file pretending to be a png
        r = upload(client, b"<html>not an image</html>", name="evil.png", content_type="image/png")
        self.assertEqual(r.status_code, 400)
        # a real PNG sent as .exe with a lying content-type still works: type comes from magic bytes
        r = upload(client, make_image(), name="photo.exe", content_type="application/x-msdownload")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["mime"], "image/png")
        # gif is not allowed even though Pillow could read it
        gif = io.BytesIO()
        Image.new("RGB", (5, 5)).save(gif, format="GIF")
        self.assertEqual(upload(client, gif.getvalue(), name="a.png").status_code, 400)

    def test_svg_rejected(self):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        r = upload(self.as_user(self.admin_a), svg, name="a.svg", content_type="image/svg+xml")
        self.assertEqual(r.status_code, 400)
        r = upload(self.as_user(self.admin_a), svg, name="a.png", content_type="image/png")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(MediaAsset.objects.count(), 0)

    def test_truncated_image_rejected(self):
        r = upload(self.as_user(self.admin_a), make_image()[:40])
        self.assertEqual(r.status_code, 400)

    def test_too_large_file_rejected(self):
        noise = Image.frombytes("RGB", (60, 60), os.urandom(60 * 60 * 3))
        buf = io.BytesIO()
        noise.save(buf, format="PNG")
        self.assertGreater(len(buf.getvalue()), 1000)
        with override_settings(MEDIA_MAX_BYTES=1000):
            r = upload(self.as_user(self.admin_a), buf.getvalue())
        self.assertEqual(r.status_code, 400)
        self.assertIn("5 MB", r.json()["detail"])

    def test_real_5mb_limit(self):
        data = make_image() + b"\x00" * (5 * 1024 * 1024)
        r = upload(self.as_user(self.admin_a), data)
        self.assertEqual(r.status_code, 400)

    def test_too_many_pixels_rejected(self):
        r = upload(self.as_user(self.admin_a), make_image(size=(4097, 4)))
        self.assertEqual(r.status_code, 400)
        r = upload(self.as_user(self.admin_a), make_image(size=(4096, 8)))
        self.assertEqual(r.status_code, 201)

    def test_decompression_bomb_rejected(self):
        # 4096x4096 = at the limit is fine; a tiny-file image far above the pixel budget is not.
        with override_settings(MEDIA_MAX_SIDE=100000):
            Image.MAX_IMAGE_PIXELS = 1000
            try:
                r = upload(self.as_user(self.admin_a), make_image(size=(200, 200)))
            finally:
                Image.MAX_IMAGE_PIXELS = 4096 * 4096
        self.assertEqual(r.status_code, 400)

    def test_exif_is_stripped(self):
        raw = make_image("JPEG", size=(30, 20), exif=True)
        self.assertIn(b"SecretCamera", raw)  # sanity: the fixture really has EXIF
        r = upload(self.as_user(self.admin_a), raw, name="a.jpg", content_type="image/jpeg")
        self.assertEqual(r.status_code, 201)
        asset = MediaAsset.objects.get(pk=r.json()["id"])
        with open(os.path.join(settings.MEDIA_ROOT, asset.file.name), "rb") as fh:
            stored = fh.read()
        self.assertNotIn(b"SecretCamera", stored)
        with Image.open(io.BytesIO(stored)) as img:
            self.assertEqual(len(img.getexif()), 0)
            self.assertEqual(img.format, "JPEG")

    def test_reencoded_not_stored_verbatim(self):
        raw = make_image("PNG") + b"TRAILING-PAYLOAD"
        r = upload(self.as_user(self.admin_a), raw)
        self.assertEqual(r.status_code, 201)
        asset = MediaAsset.objects.get(pk=r.json()["id"])
        with open(os.path.join(settings.MEDIA_ROOT, asset.file.name), "rb") as fh:
            self.assertNotIn(b"TRAILING-PAYLOAD", fh.read())

    def test_duplicate_within_branch_returns_same_asset(self):
        raw = make_image()
        first = upload(self.as_user(self.admin_a), raw)
        second = upload(self.as_user(self.teacher_a), raw)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["id"], second.json()["id"])
        self.assertEqual(MediaAsset.objects.count(), 1)

    def test_same_image_in_other_branch_is_separate_asset(self):
        raw = make_image()
        a = upload(self.as_user(self.admin_a), raw).json()
        b = upload(self.as_user(self.admin_b), raw).json()
        self.assertNotEqual(a["id"], b["id"])
        self.assertNotEqual(a["url"], b["url"])
        self.assertEqual(MediaAsset.objects.count(), 2)

    def test_branch_id_from_client_is_ignored_for_non_superadmin(self):
        r = upload(self.as_user(self.admin_a), make_image(), branch_id=str(self.b.id))
        self.assertEqual(r.status_code, 201)
        self.assertEqual(MediaAsset.objects.get(pk=r.json()["id"]).branch_id, self.a.id)

    def test_superadmin_must_name_branch(self):
        client = self.as_user(self.root)
        self.assertEqual(upload(client, make_image()).status_code, 400)
        r = upload(client, make_image(), branch_id=str(self.b.id))
        self.assertEqual(r.status_code, 201)
        self.assertEqual(MediaAsset.objects.get(pk=r.json()["id"]).branch_id, self.b.id)

    def test_anonymous_cannot_upload(self):
        r = upload(self.client, make_image())
        self.assertIn(r.status_code, (401, 403))

    def test_media_visible_only_in_own_branch(self):
        asset = MediaAsset.objects.get(pk=upload(self.as_user(self.admin_a), make_image()).json()["id"])
        self.assertEqual(self.as_user(self.admin_a).get(f"{URL}{asset.id}/").status_code, 200)
        self.assertEqual(self.as_user(self.teacher_a).get(f"{URL}{asset.id}/").status_code, 200)
        self.assertEqual(self.as_user(self.admin_b).get(f"{URL}{asset.id}/").status_code, 404)
        self.assertEqual(self.as_user(self.teacher_b).get(f"{URL}{asset.id}/").status_code, 404)
        self.assertEqual(self.as_user(self.admin_b).get(URL).json()["count"], 0)
        self.assertEqual(self.as_user(self.admin_a).get(URL).json()["count"], 1)
        self.assertEqual(self.as_user(self.root).get(URL).json()["count"], 1)

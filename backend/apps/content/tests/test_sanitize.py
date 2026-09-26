import re

from django.test import SimpleTestCase

from apps.content.services.sanitize import media_names_in, render_rich

GOOD_IMG = "/media/uploads/3f2b6c1e-0000-4000-8000-000000000000.png"


class SanitizeTests(SimpleTestCase):
    def assert_safe(self, html):
        lowered = html.lower()
        for bad in ("<script", "onerror", "onload", "style=", "<iframe", "<a "):
            self.assertNotIn(bad, lowered, html)
        # "javascript:" as visible text is harmless; as an attribute value it is not.
        self.assertIsNone(re.search(r"(href|src)\s*=\s*[\"']?\s*(javascript|data):", lowered), html)

    def test_markdown_basics(self):
        html = render_rich("md", "**qalin** va *yotiq*\n\n- bir\n- ikki")
        self.assertIn("<strong>qalin</strong>", html)
        self.assertIn("<em>yotiq</em>", html)
        self.assertIn("<ul>", html)

    def test_markdown_table_and_code(self):
        html = render_rich("md", "|a|b|\n|-|-|\n|1|2|\n\n`x`")
        self.assertIn("<table>", html)
        self.assertIn("<code>x</code>", html)

    def test_script_tag_markdown(self):
        html = render_rich("md", "salom <script>alert(1)</script>")
        self.assert_safe(html)
        self.assertNotIn("alert(1)</script>", html)

    def test_script_tag_html(self):
        html = render_rich("html", "<p>salom</p><script>alert(1)</script>")
        self.assert_safe(html)
        self.assertNotIn("alert", html)
        self.assertIn("<p>salom</p>", html)

    def test_onerror_stripped(self):
        html = render_rich("html", f'<img src="{GOOD_IMG}" onerror="alert(1)" onload="x()">')
        self.assert_safe(html)
        self.assertIn(GOOD_IMG, html)

    def test_javascript_url_markdown_and_html(self):
        for fmt, src in (
            ("md", "[klik](javascript:alert(1))"),
            ("md", "![x](javascript:alert(1))"),
            ("html", '<a href="javascript:alert(1)">x</a>'),
            ("html", '<img src="javascript:alert(1)">'),
            ("html", '<img src="JaVaScRiPt:alert(1)">'),
            ("html", '<img src="data:text/html;base64,PHNjcmlwdD4=">'),
        ):
            html = render_rich(fmt, src)
            self.assert_safe(html)
            self.assertNotIn("<img", html, (fmt, src, html))

    def test_external_img_src_removed(self):
        for src in (
            "https://evil.example/x.png",
            "http://evil.example/x.png",
            "//evil.example/x.png",
            "/media/../etc/passwd",
            "/media/uploads/../../x.png",
            "/static/x.png",
            "/media/x.png",
        ):
            html = render_rich("html", f'<img src="{src}">')
            self.assertNotIn("<img", html, (src, html))
            self.assertNotIn("evil", html)
        md = render_rich("md", "![x](https://evil.example/x.png)")
        self.assertNotIn("evil", md)

    def test_own_media_img_kept_in_markdown(self):
        html = render_rich("md", f"![rasm]({GOOD_IMG})")
        self.assertIn(f'src="{GOOD_IMG}"', html)

    def test_style_and_class_removed_disallowed_tags_dropped(self):
        html = render_rich("html", '<p style="color:red" class="x">a</p><iframe src="x"></iframe><a href="/x">l</a>')
        self.assert_safe(html)
        self.assertNotIn("class=", html)

    def test_svg_and_object_dropped(self):
        html = render_rich("html", "<svg onload=alert(1)><circle/></svg><object data=x></object><form></form>")
        self.assertNotIn("<svg", html)
        self.assertNotIn("<object", html)
        self.assertNotIn("<form", html)

    def test_raw_html_in_markdown_is_escaped(self):
        html = render_rich("md", "<img src=x onerror=alert(1)>")
        self.assertNotIn("<img", html)

    def test_empty(self):
        self.assertEqual(render_rich("md", ""), "")
        self.assertEqual(render_rich("html", None), "")

    def test_media_names_in(self):
        names = media_names_in(f"a ![x]({GOOD_IMG}) b")
        self.assertEqual(names, {"uploads/3f2b6c1e-0000-4000-8000-000000000000.png"})


class MathTests(SimpleTestCase):
    def tex(self, html):
        import html as h

        return [h.unescape(t) for t in re.findall(r'data-tex="([^"]*)"', html)]

    def test_latex_kept_verbatim(self):
        for tex in (r"{b}_{1}+{b}_{3}", r"\frac{a}{b}", r"\left| x \right|", r"\int_{0}^{4}", r"\{a\}\\ b*c<d>"):
            for fmt in ("md", "html"):
                html = render_rich(fmt, f"Hisoblang: ${tex}$ ni")
                self.assertEqual(self.tex(html), [tex], html)
                self.assertIn('<span class="math-inline" data-tex=', html)

    def test_outside_markdown_still_works(self):
        html = render_rich("md", "**qalin** *yotiq* snake_case_word $a_1*b_2$ **x**")
        self.assertEqual(html.count("<strong>"), 2)
        self.assertIn("<em>yotiq</em>", html)
        self.assertEqual(self.tex(html), ["a_1*b_2"])

    def test_block(self):
        html = render_rich("md", "Formula:\n\n$$\n" + r"\frac{a}{b}" + "\n$$\n\nOxiri")
        self.assertIn(r'<div class="math-block" data-tex="\frac{a}{b}"></div>', html)
        self.assertNotIn("<p><div", html)

    def test_unpaired_and_escaped_dollar(self):
        for fmt in ("md", "html"):
            html = render_rich(fmt, "Narxi $5 va $10 bo'ldi")
            self.assertNotIn("data-tex", html)
            self.assertIn("$5 va $10", html)
            html = render_rich(fmt, r"\$x\$ va $y$")
            self.assertEqual(self.tex(html), ["y"])
            self.assertIn("$x$", html)

    def test_xss(self):
        html = render_rich("md", '$"><script>alert(1)</script><img src=x onerror=alert(1)>$')
        self.assertNotIn("<script", html)
        self.assertNotIn("<img", html)
        self.assertEqual(len(re.findall(r"<span", html)), 1)
        self.assertEqual(self.tex(html), ['"><script>alert(1)</script><img src=x onerror=alert(1)>'])
        for fmt in ("md", "html"):
            html = render_rich(
                fmt, '<span class="math-inline" data-tex="x" onclick="a()">q</span><div class="math-block" data-tex="y">z</div>'
            )
            self.assertNotIn("<span class", html)
            self.assertNotIn("<span data", html)
            self.assertNotIn("<div", html)
            self.assertIsNone(re.search(r"<[^>]*onclick", html), html)

    def test_html_mode_and_markers(self):
        html = render_rich("html", "<p>a $x^2$ b</p><p>$$y$$</p>\ue000" "0\ue001")
        self.assertEqual(self.tex(html), ["x^2", "y"])

    def test_option_text(self):
        html = render_rich("md", r"$\sqrt{2}$")
        self.assertEqual(self.tex(html), [r"\sqrt{2}"])

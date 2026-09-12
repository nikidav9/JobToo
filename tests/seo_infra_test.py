#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from xml.etree import ElementTree


root = Path(__file__).resolve().parents[1]
robots = (root / "public/robots.txt").read_text(encoding="utf-8")
sitemap = ElementTree.parse(root / "public/sitemap.xml").getroot()
nginx = (root / "infra/nginx-site.conf").read_text(encoding="utf-8")

assert "Sitemap: https://jobtoo.ru/sitemap.xml" in robots
assert "Disallow: /api/" in robots
assert "Disallow: /admin" in robots

namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
urls = [node.text for node in sitemap.findall("sm:url/sm:loc", namespace)]
assert urls[0] == "https://jobtoo.ru/"
assert all(url and url.startswith("https://jobtoo.ru/") for url in urls)
assert not any("vacancy" in url for url in urls)
assert {parse_qs(urlparse(url).query).get("doc", [""])[0] for url in urls} >= {
    "terms", "privacy", "dataPolicy", "consent"
}

assert "location = /robots.txt" in nginx
assert "default_type text/plain" in nginx
assert "location = /sitemap.xml" in nginx
assert "default_type application/xml" in nginx
assert "(?!api/|rest/|realtime/|storage/)" in nginx
assert "try_files $uri =404" in nginx
assert "try_files $uri $uri/ /index.html" in nginx

print("seo infrastructure: OK")

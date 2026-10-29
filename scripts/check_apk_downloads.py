#!/usr/bin/env python3
"""Check the real APK links in the rendered mobile landing after deployment."""

from html.parser import HTMLParser
import sys
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen


class AndroidLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        href = attrs.get("href", "")
        if (tag == "a" and attrs.get("data-store") == "android"
                and "data-placeholder" not in attrs and href and not href.startswith("#")):
            self.urls.add(href)


def check_download(url):
    if urlsplit(url).scheme not in ("http", "https"):
        raise ValueError("APK download must use HTTP(S)")
    with urlopen(Request(url, method="HEAD"), timeout=30) as response:
        mime = response.headers.get_content_type()
        if mime not in ("application/vnd.android.package-archive", "application/octet-stream"):
            raise ValueError(f"APK URL returned {mime}, not a binary download: {url}")
        if int(response.headers.get("Content-Length", "0")) <= 4:
            raise ValueError(f"APK download is empty: {url}")
    with urlopen(Request(url, headers={"Range": "bytes=0-3"}), timeout=30) as response:
        if response.read(4) != b"PK\x03\x04":
            raise ValueError(f"APK download has no ZIP header: {url}")


def main():
    page_url = sys.argv[1] if len(sys.argv) > 1 else "https://wiring.club/m"
    parser = AndroidLinks()
    parser.feed(sys.stdin.read())
    for href in sorted(parser.urls):
        url = urljoin(page_url, href)
        check_download(url)
        print(f"APK download available: {url}")
    if not parser.urls:
        print("Android APK is not configured; download check skipped")


if __name__ == "__main__":
    main()

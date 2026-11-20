
import json
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from html import unescape
import re
import hashlib

FEEDS = [
    ("BBC", "World", "https://feeds.bbci.co.uk/news/world/rss.xml"),
    ("BBC", "Business", "https://feeds.bbci.co.uk/news/business/rss.xml"),
    ("BBC", "Technology", "https://feeds.bbci.co.uk/news/technology/rss.xml"),
    ("BBC", "Science", "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml"),
    ("Guardian", "World", "https://www.theguardian.com/world/rss"),
    ("Guardian", "Business", "https://www.theguardian.com/business/rss"),
    ("Guardian", "Technology", "https://www.theguardian.com/technology/rss"),
]

def clean(value):
    value = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", unescape(value)).strip()

def tag_text(element, name):
    for child in element:
        if child.tag.split("}")[-1] == name:
            return child.text or ""
    return ""

def find_audio(item):
    for child in item.iter():
        name = child.tag.split("}")[-1].lower()

        if name not in ("enclosure", "content"):
            continue

        url = child.attrib.get("url", "").strip()
        mime = child.attrib.get("type", "").lower()

        if not url.startswith("https://"):
            continue

        if (
            mime.startswith("audio/")
            or re.search(r"\.(mp3|m4a|aac|ogg|wav)(\?|$)", url, re.I)
        ):
            return url

    return ""

articles = []
seen = set()

for source, topic, feed_url in FEEDS:
    try:
        request = urllib.request.Request(
            feed_url,
            headers={"User-Agent": "DailyNewsEnglish/1.0"}
        )

        with urllib.request.urlopen(request, timeout=20) as response:
            root = ET.fromstring(response.read())

        for item in root.iter():
            kind = item.tag.split("}")[-1]

            if kind not in ("item", "entry"):
                continue

            title = clean(tag_text(item, "title"))
            link = tag_text(item, "link").strip()

            if not link:
                for child in item:
                    if child.tag.split("}")[-1] == "link":
                        link = child.attrib.get("href", "")
                        if link:
                            break

            summary = clean(
                tag_text(item, "description")
                or tag_text(item, "summary")
                or tag_text(item, "content")
            )

            published = (
                tag_text(item, "pubDate")
                or tag_text(item, "published")
                or tag_text(item, "updated")
            )

            if not title or not link.startswith("https://"):
                continue

            article_id = hashlib.sha256(link.encode()).hexdigest()[:16]

            if article_id in seen:
                continue

            seen.add(article_id)

            audio_url = find_audio(item)

            articles.append({
                "id": article_id,
                "title": title,
                "source": source,
                "topic": topic,
                "url": link,
                "summary": summary[:600],
                "published": published,
                "audio_url": audio_url,
                "has_audio": bool(audio_url)
            })

    except Exception as error:
        print(f"Feed error ({source}/{topic}): {error}")

articles = articles[:100]

data = {
    "updated_at": datetime.now(timezone.utc).isoformat(),
    "articles": articles
}

output = Path("data/news.json")
output.parent.mkdir(parents=True, exist_ok=True)

output.write_text(
    json.dumps(data, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

audio_count = sum(1 for article in articles if article["has_audio"])

print(f"Saved {len(articles)} articles to {output}")
print(f"Articles with audio: {audio_count}")

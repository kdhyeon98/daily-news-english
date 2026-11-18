
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

            articles.append({
                "id": article_id,
                "title": title,
                "source": source,
                "topic": topic,
                "url": link,
                "summary": summary[:600],
                "published": published
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

print(f"Saved {len(articles)} articles to {output}")

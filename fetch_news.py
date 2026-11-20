
import json
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from html import unescape
import re
import hashlib

NEWS_FEEDS = [
    ("BBC", "World", "https://feeds.bbci.co.uk/news/world/rss.xml"),
    ("BBC", "Business", "https://feeds.bbci.co.uk/news/business/rss.xml"),
    ("BBC", "Technology", "https://feeds.bbci.co.uk/news/technology/rss.xml"),
    ("BBC", "Science", "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml"),
    ("Guardian", "World", "https://www.theguardian.com/world/rss"),
    ("Guardian", "Business", "https://www.theguardian.com/business/rss"),
    ("Guardian", "Technology", "https://www.theguardian.com/technology/rss"),
]

PODCAST_FEEDS = [
    {
        "session": "morning",
        "source": "BBC Learning English",
        "level": "Upper-intermediate",
        "url": "https://podcasts.files.bbci.co.uk/p05hw4bq.rss",
    },
    {
        "session": "evening",
        "source": "BBC World Service",
        "level": "Authentic news bulletin",
        "url": "https://podcast.voice.api.bbci.co.uk/rss/audio/p002vsmz?api_key=JqAy8fGqi8lpxLsr3WaGxyG31AZ5URMr",
    },
]


def local_name(tag):
    return tag.split("}")[-1]


def clean(value):
    value = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", unescape(value)).strip()


def child_text(element, names):
    for child in element:
        if local_name(child.tag) in names:
            if child.text:
                return child.text.strip()
    return ""


def get_link(item):
    for child in item:
        if local_name(child.tag) == "link":
            href = child.attrib.get("href", "")
            if href:
                return href
            if child.text:
                return child.text.strip()
    return ""


def get_audio_url(item):
    for child in item.iter():
        name = local_name(child.tag).lower()

        if name in ("enclosure", "content"):
            url = child.attrib.get("url", "")
            media_type = child.attrib.get("type", "").lower()

            if url and (
                media_type.startswith("audio/")
                or re.search(r"\.(mp3|m4a|aac|ogg|wav)(\?|$)", url, re.I)
            ):
                return url

    return ""


def fetch_xml(url):
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "DailyNewsEnglish/1.0"}
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        return ET.fromstring(response.read())


def fetch_news():
    articles = []
    seen = set()

    for source, topic, feed_url in NEWS_FEEDS:
        try:
            root = fetch_xml(feed_url)

            for item in root.iter():
                if local_name(item.tag) not in ("item", "entry"):
                    continue

                title = clean(child_text(item, {"title"}))
                link = get_link(item)

                summary = clean(
                    child_text(item, {"description", "summary", "encoded"})
                )

                published = child_text(
                    item, {"pubDate", "published", "updated"}
                )

                if not title or not link.startswith("https://"):
                    continue

                article_id = hashlib.sha256(
                    link.encode()
                ).hexdigest()[:16]

                if article_id in seen:
                    continue

                seen.add(article_id)

                articles.append({
                    "id": article_id,
                    "title": title,
                    "source": source,
                    "topic": topic,
                    "url": link,
                    "summary": summary[:1000],
                    "published": published
                })

        except Exception as error:
            print(f"News feed error ({source}/{topic}): {error}")

    return articles[:100]


def fetch_podcasts():
    lessons = []

    for feed in PODCAST_FEEDS:
        try:
            root = fetch_xml(feed["url"])

            for item in root.iter():
                if local_name(item.tag) not in ("item", "entry"):
                    continue

                title = clean(child_text(item, {"title"}))
                description = clean(
                    child_text(item, {"description", "summary", "encoded"})
                )
                audio_url = get_audio_url(item)
                episode_url = get_link(item)

                if not title or not audio_url:
                    continue

                episode_id = hashlib.sha256(
                    audio_url.encode()
                ).hexdigest()[:16]

                lessons.append({
                    "id": episode_id,
                    "session": feed["session"],
                    "source": feed["source"],
                    "level": feed["level"],
                    "title": title,
                    "description": description[:2000],
                    "audio_url": audio_url,
                    "episode_url": episode_url,
                    "published": child_text(
                        item, {"pubDate", "published", "updated"}
                    )
                })

                # 최신 에피소드만 수집
                break

        except Exception as error:
            print(
                f"Podcast feed error ({feed['source']}): {error}"
            )

    return lessons


data = {
    "updated_at": datetime.now(timezone.utc).isoformat(),
    "articles": fetch_news(),
    "audio_lessons": fetch_podcasts()
}

output = Path("data/news.json")
output.parent.mkdir(parents=True, exist_ok=True)

output.write_text(
    json.dumps(data, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print(f"Saved {len(data['articles'])} articles")
print(f"Saved {len(data['audio_lessons'])} audio lessons")

for lesson in data["audio_lessons"]:
    print(
        lesson["session"],
        lesson["source"],
        lesson["title"],
        bool(lesson["audio_url"])
    )


import json
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from html import unescape
import re
import hashlib


# 기존 뉴스 기사 피드: 그대로 유지
NEWS_FEEDS = [
    ("BBC", "World", "https://feeds.bbci.co.uk/news/world/rss.xml"),
    ("BBC", "Business", "https://feeds.bbci.co.uk/news/business/rss.xml"),
    ("BBC", "Technology", "https://feeds.bbci.co.uk/news/technology/rss.xml"),
    ("BBC", "Science", "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml"),
    ("Guardian", "World", "https://www.theguardian.com/world/rss"),
    ("Guardian", "Business", "https://www.theguardian.com/business/rss"),
    ("Guardian", "Technology", "https://www.theguardian.com/technology/rss"),
]


# BBC 공식 팟캐스트 피드
AUDIO_FEEDS = {
    "morning": {
        "source": "BBC Learning English",
        "title": "Learning English from the News",
        "feed_url": "https://podcasts.files.bbci.co.uk/p05hw4bq.rss",
        "description": "학습자를 위한 뉴스 영어 콘텐츠"
    },
    "evening": {
        "source": "BBC World Service",
        "title": "BBC News",
        "feed_url": (
            "https://podcast.voice.api.bbci.co.uk/rss/audio/"
            "p002vsmz?api_key=JqAy8fGqi8lpxLsr3WaGxyG31AZ5URMr"
        ),
        "description": "실제 뉴스 앵커의 5분 뉴스 보도"
    }
}


def clean(value):
    value = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", unescape(value)).strip()


def local_name(tag):
    return tag.split("}")[-1].lower()


def child_text(element, names):
    if isinstance(names, str):
        names = [names]

    for child in element:
        if local_name(child.tag) in names:
            if child.text:
                return child.text.strip()

    return ""


def child_element(element, name):
    for child in element:
        if local_name(child.tag) == name.lower():
            return child
    return None


def get_link(item):
    link_element = child_element(item, "link")

    if link_element is None:
        return ""

    return (
        link_element.attrib.get("href")
        or (link_element.text or "").strip()
    )


def get_audio_url(item):
    # RSS enclosure
    for child in item:
        name = local_name(child.tag)

        if name == "enclosure":
            media_type = child.attrib.get("type", "").lower()
            url = child.attrib.get("url", "")

            if url and (
                media_type.startswith("audio/")
                or re.search(
                    r"\.(mp3|m4a|aac|ogg|wav)(\?|$)",
                    url,
                    re.I
                )
            ):
                return url

        # Media RSS content
        if name == "content":
            media_type = child.attrib.get("type", "").lower()
            url = child.attrib.get("url", "")

            if url and (
                media_type.startswith("audio/")
                or re.search(
                    r"\.(mp3|m4a|aac|ogg|wav)(\?|$)",
                    url,
                    re.I
                )
            ):
                return url

    return ""


def get_transcript(item):
    # Podcasting 2.0 transcript extension
    for child in item.iter():
        if local_name(child.tag) != "transcript":
            continue

        url = child.attrib.get("url", "")
        mime = child.attrib.get("type", "").lower()

        if url and (
            "text" in mime
            or "html" in mime
            or "json" in mime
        ):
            return url

    return ""


def get_duration(item):
    value = child_text(item, "duration")

    if not value:
        return ""

    return value


def fetch_xml(url):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "DailyNewsEnglish/2.0",
            "Accept": "application/rss+xml, application/xml, text/xml"
        }
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        return ET.fromstring(response.read())


# --------------------------------------------------
# 1. 기존 뉴스 기사 수집
# --------------------------------------------------

articles = []
seen = set()

for source, topic, feed_url in NEWS_FEEDS:
    try:
        root = fetch_xml(feed_url)

        for item in root.iter():
            if local_name(item.tag) not in ("item", "entry"):
                continue

            title = clean(child_text(item, "title"))
            link = get_link(item)

            summary = clean(
                child_text(
                    item,
                    ["description", "summary", "encoded"]
                )
            )

            published = child_text(
                item,
                ["pubdate", "published", "updated"]
            )

            if not title or not link.startswith("https://"):
                continue

            article_id = hashlib.sha256(
                link.encode("utf-8")
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
                "summary": summary[:600],
                "published": published
            })

    except Exception as error:
        print(f"News feed error ({source}/{topic}): {error}")


articles = articles[:100]


# --------------------------------------------------
# 2. 아침·저녁 실제 오디오 수집
# --------------------------------------------------

audio_lessons = {}

for session, config in AUDIO_FEEDS.items():

    lesson = {
        "session": session,
        "source": config["source"],
        "title": config["title"],
        "description": config["description"],
        "feed_url": config["feed_url"],
        "episode_title": "",
        "audio_url": "",
        "transcript_url": "",
        "episode_url": "",
        "published": "",
        "duration": "",
        "audio_available": False,
        "transcript_available": False
    }

    try:
        root = fetch_xml(config["feed_url"])

        episodes = []

        for item in root.iter():
            if local_name(item.tag) not in ("item", "entry"):
                continue

            episode_title = clean(
                child_text(item, "title")
            )

            audio_url = get_audio_url(item)

            if not episode_title or not audio_url:
                continue

            episodes.append({
                "title": episode_title,
                "audio_url": audio_url,
                "transcript_url": get_transcript(item),
                "episode_url": get_link(item),
                "published": child_text(
                    item,
                    ["pubdate", "published", "updated"]
                ),
                "duration": get_duration(item)
            })

        if episodes:
            latest = episodes[0]

            lesson.update({
                "episode_title": latest["title"],
                "audio_url": latest["audio_url"],
                "transcript_url": latest["transcript_url"],
                "episode_url": latest["episode_url"],
                "published": latest["published"],
                "duration": latest["duration"],
                "audio_available": True,
                "transcript_available": bool(
                    latest["transcript_url"]
                )
            })

        print(
            f"Audio feed ({session}): "
            f"{len(episodes)} episodes found"
        )

    except Exception as error:
        print(f"Audio feed error ({session}): {error}")

    audio_lessons[session] = lesson


# --------------------------------------------------
# 3. 기존 데이터 + 오디오 데이터 저장
# --------------------------------------------------

data = {
    "updated_at": datetime.now(timezone.utc).isoformat(),
    "articles": articles,
    "audio_lessons": audio_lessons
}

output = Path("data/news.json")
output.parent.mkdir(parents=True, exist_ok=True)

output.write_text(
    json.dumps(data, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print(f"Saved {len(articles)} news articles.")

for session, lesson in audio_lessons.items():
    print(
        f"{session}: "
        f"audio={lesson['audio_available']}, "
        f"transcript={lesson['transcript_available']}"
    )

print(f"Saved audio lessons to {output}")

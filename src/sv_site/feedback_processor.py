"""
AI processing for customer feedback using Claude Haiku.
Called synchronously from the ingest endpoint.
Degrades gracefully when ANTHROPIC_API_KEY is absent or call fails.
"""
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_VALID_TAGS = {
    "new feature request", "bug report", "praise", "improvement suggestion",
    "missing content", "performance issue", "ui/ux", "documentation",
    "confusing/unclear", "other",
}
_VALID_SENTIMENTS = {"positive", "neutral", "negative", "mixed"}

_SYSTEM_PROMPT = """\
You are a feedback analyst. Given raw user feedback about a software product, extract
structured information and return ONLY a valid JSON object — no markdown, no code fences.

Fields:
- summary (string): 1–3 neutral, factual sentences summarizing the feedback
- sentiment (string): exactly one of: "positive", "neutral", "negative", "mixed"
- tags (array): 1–4 tags chosen ONLY from this list:
    "new feature request", "bug report", "praise", "improvement suggestion",
    "missing content", "performance issue", "ui/ux", "documentation",
    "confusing/unclear", "other"

Return format: {"summary": "...", "sentiment": "...", "tags": ["..."]}
"""


async def process_feedback(
    raw_feedback: str,
    score: Optional[int],
    program_name: str,
    api_key: str,
) -> dict:
    """
    Returns dict with keys: summary, sentiment, tags, error.
    All content fields may be None if processing fails.
    """
    if not api_key:
        return {"summary": None, "sentiment": None, "tags": None,
                "error": "ANTHROPIC_API_KEY not configured"}

    try:
        import anthropic

        user_content = (
            f"Program: {program_name}\n"
            f"Score: {score}/10\n"
            f"Feedback:\n{raw_feedback}"
        )

        client = anthropic.AsyncAnthropic(api_key=api_key)
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )

        raw_text = message.content[0].text.strip() if message.content else ""
        logger.info("AI raw response: %r (stop_reason=%s)", raw_text[:200], message.stop_reason)
        # Strip markdown code fences if present
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        parsed = json.loads(raw_text)

        summary = parsed.get("summary") or None
        raw_sentiment = parsed.get("sentiment", "").lower()
        sentiment = raw_sentiment if raw_sentiment in _VALID_SENTIMENTS else "neutral"
        raw_tags = parsed.get("tags") or []
        tags = [t for t in raw_tags if t in _VALID_TAGS]

        return {"summary": summary, "sentiment": sentiment, "tags": tags, "error": None}

    except ImportError:
        logger.error("anthropic package not installed")
        return {"summary": None, "sentiment": None, "tags": None,
                "error": "anthropic package not installed"}
    except Exception as exc:
        logger.error("Feedback AI processing failed: %s", exc)
        return {"summary": None, "sentiment": None, "tags": None, "error": str(exc)}

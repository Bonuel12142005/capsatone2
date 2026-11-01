"""Bounded screenshot OCR for the Screenshot Review Analyzer.

This module is deliberately separate from the trained fake-review classifier.
OCR produces review candidates only; users must verify candidates before the
existing analysis route is called. No text is generated when OCR is missing or
uncertain.
"""

from collections import defaultdict
from difflib import SequenceMatcher
import hashlib
import io
import logging
import os
import re
import shutil
from statistics import median
from typing import Any

logger = logging.getLogger(__name__)

try:
    from PIL import Image, ImageEnhance, ImageOps
    from PIL.Image import Resampling
    import pytesseract
    from pytesseract import Output
    OCR_IMPORT_ERROR = None
except ImportError as exc:  # The API remains available and reports 503 safely.
    Image = None
    ImageEnhance = None
    ImageOps = None
    Resampling = None
    pytesseract = None
    Output = None
    OCR_IMPORT_ERROR = str(exc)

MAX_FILES = 5
MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 20_000_000
MAX_DIMENSION = 8_000
MAX_CANDIDATES = 100

NOISE_PATTERNS = (
    r"^reviews?$", r"^ratings?$", r"^see all", r"^buy now$", r"^add to cart$",
    r"^share$", r"^follow$", r"^helpful$", r"^report$", r"^reply$",
    r"^verified purchase$", r"^sold\b", r"^₱", r"^php\s*[\d,.]+$",
)

NOISE_LINE_PATTERNS = (
    r"^(?:customer\s+)?reviews?$",
    r"^(?:bukti tayang|dari pembeli|see all|buy now|add to cart|chat now|follow|share|helpful|report|reply)$",
    r"^(?:baru|gold|platinum|verified purchase|options?\b)",
    r"\b(?:bintang|stars?)\b",
    r"^(?:\d{1,2}[:.]\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})(?:\s|$)",
    r"\.\.\.$",
    r"^(?:₱|php|rm)\s*[\d,.]+$",
)


def is_available() -> bool:
    return Image is not None and pytesseract is not None


def _clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _language(text: str) -> str:
    lowered = f" {text.lower()} "
    tagalog = (" ang ", " ng ", " mga ", " ito ", " hindi ", " salamat ", " maganda ", " ganda ", " pero ", " sobrang ", " po ", " naman ", " ako ", " mula ", " dahil ", " sa ", " inyo ")
    english = (" the ", " and ", " is ", " this ", " product ", " good ", " very ", " with ", " seller ", " party ", " set ", " cute ", " free ", " skin ", " type ", " fast ", " thank ", " thanks ")
    tagalog_hits = sum(1 for marker in tagalog if marker in lowered)
    english_hits = sum(1 for marker in english if marker in lowered)
    if tagalog_hits and english_hits:
        return "Taglish"
    if tagalog_hits:
        return "Tagalog"
    return "English"


def _is_noise(text: str) -> bool:
    normalized = _clean_text(text).lower()
    if len(normalized) < 8:
        return True
    if not re.search(r"[a-zA-ZÀ-ÿ]", normalized):
        return True
    return any(re.search(pattern, normalized, flags=re.IGNORECASE) for pattern in NOISE_PATTERNS)


def _is_noise_line(text: str) -> bool:
    """Remove obvious UI lines while leaving review wording untouched."""
    normalized = _clean_text(text).lower()
    letters = re.findall(r"[a-z]", normalized)
    if len(normalized) < 4 or len(letters) < 3 or not re.search(r"[a-z]", normalized):
        return True
    if len(letters) / max(len(normalized), 1) < 0.35:
        return True
    match_text = re.sub(r"^[^a-z]+", "", normalized)
    ui_words = {"add", "buy", "cart", "chat", "follow", "helpful", "now", "reply", "report", "share", "to"}
    words = re.findall(r"[a-z]+", match_text)
    if len(words) >= 2 and all(word in ui_words for word in words):
        return True
    if re.search(r"\bdari pembeli\b|\boptions?\s*:", match_text):
        return True
    if re.search(r"^\d{1,2}\s+[a-z]{3,9}\s+\d{4}\b", match_text):
        return True
    if re.fullmatch(r"[a-z0-9_*.-]{2,24}", match_text) and re.search(r"[*._\d]", match_text):
        return True
    return any(re.search(pattern, match_text, flags=re.IGNORECASE) for pattern in NOISE_LINE_PATTERNS)


def _preprocess(image: Any) -> Any:
    if ImageOps is None or ImageEnhance is None or Resampling is None:
        raise RuntimeError("Pillow is not installed or configured for OCR")
    image = ImageOps.exif_transpose(image).convert("RGB")
    width, height = image.size
    longest = max(width, height)
    if longest > 2400:
        scale = 2400 / longest
        image = image.resize((max(1, int(width * scale)), max(1, int(height * scale))), Resampling.LANCZOS)
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray)
    return ImageEnhance.Sharpness(gray).enhance(1.15)


def _resolve_tesseract_cmd() -> str | None:
    """Resolve Tesseract without tying deployment to one machine path.

    The explicit environment setting remains the deployment override. Windows
    installers commonly do not add Tesseract to PATH, so the standard install
    roots are checked using environment-provided directories. Linux/macOS
    deployments continue to use PATH or an explicit override.
    """
    configured = os.environ.get("ECHOTRACE_TESSERACT_CMD", "").strip()
    candidates: list[str] = []
    if configured:
        candidates.append(configured)

    discovered = shutil.which("tesseract")
    if discovered:
        candidates.append(discovered)

    if os.name == "nt":
        for root_name in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
            root = os.environ.get(root_name, "").strip()
            if root:
                candidates.append(os.path.join(root, "Tesseract-OCR", "tesseract.exe"))

    for candidate in candidates:
        if os.path.isfile(candidate):
            return candidate
    return None


def _configure_tesseract() -> None:
    if pytesseract is None:
        return
    resolved = _resolve_tesseract_cmd()
    if resolved:
        pytesseract.pytesseract.tesseract_cmd = resolved


def _ocr_language() -> tuple[str, list[str]]:
    if pytesseract is None:
        raise RuntimeError("pytesseract is not installed or configured")
    warnings: list[str] = []
    _configure_tesseract()
    try:
        languages = set(pytesseract.get_languages(config=""))
    except Exception as exc:
        raise RuntimeError("Tesseract OCR is not installed or is not executable") from exc
    if "eng" not in languages:
        raise RuntimeError("Tesseract English language data is not installed")
    if "tgl" in languages:
        return "eng+tgl", warnings
    warnings.append("Filipino language data (tgl) is not installed; English OCR was used. Verify Tagalog or Taglish text manually.")
    return "eng", warnings


def _extract_blocks(image: Any, language: str) -> list[tuple[str, str, float | None]]:
    if pytesseract is None or Output is None:
        raise RuntimeError("pytesseract is not installed or configured")
    data = pytesseract.image_to_data(
        image,
        lang=language,
        config="--oem 3 --psm 6",
        output_type=Output.DICT,
    )
    lines: dict[tuple[int, int, int], list[dict[str, Any]]] = defaultdict(list)
    total = len(data.get("text", []))
    for index in range(total):
        text = _clean_text(data["text"][index])
        if not text:
            continue
        try:
            confidence = float(data.get("conf", [0])[index])
        except (TypeError, ValueError, IndexError):
            confidence = -1.0
        key = (
            int(data.get("block_num", [0])[index]),
            int(data.get("par_num", [0])[index]),
            int(data.get("line_num", [0])[index]),
        )
        left = int(data.get("left", [0])[index])
        top = int(data.get("top", [0])[index])
        height = max(1, int(data.get("height", [1])[index]))
        lines[key].append({
            "left": left,
            "top": top,
            "bottom": top + height,
            "text": text,
            "confidence": confidence,
        })

    # Tesseract frequently assigns a whole vertical review list to one block.
    # Keep line coordinates and segment on the visual gap between cards instead
    # of treating block_num as a review boundary.
    line_records: list[dict[str, Any]] = []
    for tokens in lines.values():
        tokens.sort(key=lambda item: item["left"])
        line = " ".join(token["text"] for token in tokens)
        confidence_values = [token["confidence"] for token in tokens if token["confidence"] >= 0]
        confidence = sum(confidence_values) / len(confidence_values) if confidence_values else -1.0
        line_records.append({
            "left": min(token["left"] for token in tokens),
            "top": min(token["top"] for token in tokens),
            "bottom": max(token["bottom"] for token in tokens),
            "height": max(token["bottom"] for token in tokens) - min(token["top"] for token in tokens),
            "text": line,
            "confidence": confidence,
        })

    line_records.sort(key=lambda item: (item["top"], item["left"]))
    review_lines = [line for line in line_records if not _is_noise_line(line["text"])]
    if not review_lines:
        return []

    line_heights = [max(1, line["height"]) for line in review_lines]
    # Wrapped lines in one review are normally close together. A larger visual
    # gap is treated as the boundary between adjacent review cards. The lower
    # bound prevents small OCR coordinate errors from splitting one review.
    boundary_gap = max(18.0, float(median(line_heights)) * 1.65)
    segments: list[list[dict[str, Any]]] = []
    current = [review_lines[0]]
    for line in review_lines[1:]:
        gap = float(line["top"] - current[-1]["bottom"])
        if gap >= boundary_gap:
            segments.append(current)
            current = []
        current.append(line)
    segments.append(current)

    extracted: list[tuple[str, str, float | None]] = []
    for segment in segments:
        original_text = "\n".join(line["text"] for line in segment).strip()
        text = _clean_text(original_text)
        if _is_noise(text):
            continue
        confidence_values = [line["confidence"] for line in segment if line["confidence"] >= 0]
        confidence = sum(confidence_values) / len(confidence_values) if confidence_values else None
        extracted.append((text[:10000], original_text[:10000], round(confidence, 1) if confidence is not None else None))
    return extracted


def _deduplicate(candidates: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    unique: list[dict[str, Any]] = []
    seen = set()
    removed = 0
    for candidate in candidates:
        normalized = re.sub(r"[^\w\s]", "", candidate["text"].lower())
        fingerprint = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        if fingerprint in seen or any(SequenceMatcher(None, normalized, re.sub(r"[^\w\s]", "", item["text"].lower())).ratio() >= 0.92 for item in unique):
            removed += 1
            continue
        seen.add(fingerprint)
        unique.append(candidate)
    return unique, removed


def extract_reviews(file_storages: list[Any], platform: str = "auto", title: str = "") -> dict[str, Any]:
    if not is_available():
        return {
            "success": False,
            "error_code": "ocr_unavailable",
            "error": "Open-source OCR is not installed or configured on the server. No review text was extracted or saved.",
        }
    if Image is None:
        # Keep the optional-dependency failure explicit for type checkers and
        # retain the same safe runtime response as the availability check.
        return {
            "success": False,
            "error_code": "ocr_unavailable",
            "error": "Open-source OCR is not installed or configured on the server. No review text was extracted or saved.",
        }
    if len(file_storages) == 0 or len(file_storages) > MAX_FILES:
        return {"success": False, "error_code": "ocr_upload_limit", "error": "Upload between 1 and 5 screenshots."}

    try:
        language, warnings = _ocr_language()
    except RuntimeError as exc:
        logger.warning("OCR unavailable: %s", str(exc)[:180])
        return {"success": False, "error_code": "ocr_unavailable", "error": "Open-source OCR is not installed or configured on the server. No review text was extracted or saved."}

    candidates: list[dict[str, Any]] = []
    image_warnings = list(warnings)
    for image_index, file_storage in enumerate(file_storages):
        raw = file_storage.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            return {"success": False, "error_code": "ocr_upload_limit", "error": f"Screenshot {image_index + 1} exceeds the 5 MB limit."}
        try:
            image = Image.open(io.BytesIO(raw))
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError("unsupported image format")
            width, height = image.size
            if width < 1 or height < 1 or width > MAX_DIMENSION or height > MAX_DIMENSION or width * height > MAX_PIXELS:
                raise ValueError("unsafe image dimensions")
            image.load()
            processed = _preprocess(image)
            blocks = _extract_blocks(processed, language)
        except Exception as exc:
            logger.warning("OCR image %s failed: %s", image_index + 1, str(exc)[:180])
            image_warnings.append(f"Screenshot {image_index + 1} could not be read safely; it was skipped.")
            continue

        if not blocks:
            image_warnings.append(f"No review text was detected in screenshot {image_index + 1}.")
        for block_index, (text, original_text, confidence) in enumerate(blocks):
            candidate = {
                "id": f"ocr-{image_index + 1}-{block_index + 1}",
                "text": text,
                "original_text": original_text,
                "author": "Anonymous",
                "rating": None,
                "language": _language(text),
                "confidence": confidence,
                "source_image": image_index + 1,
                "warning": "Review boundaries are heuristic; verify this text before analysis." + (" Low OCR confidence; verify carefully." if confidence is not None and confidence < 60 else ""),
            }
            candidates.append(candidate)
            if len(candidates) >= MAX_CANDIDATES:
                image_warnings.append("The 100-review candidate limit was reached.")
                break
        if len(candidates) >= MAX_CANDIDATES:
            break

    candidates, duplicates_removed = _deduplicate(candidates)
    if not candidates:
        return {
            "success": False,
            "error_code": "reviews_unavailable",
            "error": "No customer review text was detected in the screenshots. Nothing was saved.",
            "warnings": image_warnings,
        }
    return {
        "success": True,
        "candidates": candidates,
        "candidate_count": len(candidates),
        "duplicates_removed": duplicates_removed,
        "warnings": image_warnings,
        "ocr_language": language,
        "platform": platform or "auto",
        "title": title[:255],
    }

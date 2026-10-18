"""Remove flat export margins from generated landing scene plates.

This is intentionally a source-asset cleanup. Section transitions should not
need runtime blur panels, masks, or duplicated pseudo-elements to hide margins
that were baked into an image export.
"""

from pathlib import Path

from PIL import Image


SCENES = Path(__file__).resolve().parents[1] / "src" / "assets" / "landing" / "scenes"


def crop_scene(source: str, output: str, top: int, bottom: int, **save_options: object) -> None:
    image = Image.open(SCENES / source)
    width, height = image.size
    cleaned = image.crop((0, top, width, height - bottom))
    cleaned.save(SCENES / output, **save_options)


crop_scene(
    "reclaim-evidence-scene-v1.webp",
    "reclaim-evidence-scene-v1-clean.webp",
    top=52,
    bottom=50,
    format="WEBP",
    quality=92,
    method=6,
)

crop_scene(
    "reclaim-pricing-plate-v2.jpg",
    "reclaim-pricing-plate-v2-clean.jpg",
    top=72,
    bottom=72,
    format="JPEG",
    quality=94,
    optimize=True,
    progressive=True,
)

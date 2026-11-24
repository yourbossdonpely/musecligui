"""Draws MuseCodeIcon's app icon: a gold M with a spark on a black tile.

    python apps/desktop/assets/make-icon.py
    cd apps/desktop && npx tauri icon assets/icon-source.png

Pillow only, no network. Everything is drawn at 4x and downsampled, so the curves and
the diagonal edges stay smooth. The mark is the same one the UI's <Logo> draws, so the
window icon, the installer and the sidebar all show one logo.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SS = 4  # supersampling
SIZE = 1024
S = SIZE * SS
HERE = Path(__file__).parent

BLACK_TOP = (19, 16, 12)
BLACK_BOTTOM = (6, 5, 4)
GOLD_LIGHT = (252, 236, 190)
GOLD_MID = (226, 176, 78)
GOLD_DEEP = (166, 116, 38)
RADIUS = 232


def scaled(points):
    return [(x * SS, y * SS) for x, y in points]


def vertical_gradient(size, stops):
    """stops: [(position 0..1, rgb), ...] top to bottom."""
    image = Image.new("RGB", (1, size))
    pixels = image.load()
    for y in range(size):
        at = y / max(size - 1, 1)
        for i in range(len(stops) - 1):
            start, color = stops[i]
            end, next_color = stops[i + 1]
            if start <= at <= end:
                t = 0 if end == start else (at - start) / (end - start)
                pixels[0, y] = tuple(round(color[c] + (next_color[c] - color[c]) * t) for c in range(3))
                break
        else:
            pixels[0, y] = stops[-1][1]
    return image.resize((size, size))


def main():
    tile = vertical_gradient(S, [(0.0, BLACK_TOP), (1.0, BLACK_BOTTOM)]).convert("RGBA")

    # A faint gold glow behind the mark, so the black is not flat.
    glow = Image.new("L", (S, S), 0)
    ImageDraw.Draw(glow).ellipse([S * 0.16, S * 0.22, S * 0.84, S * 0.90], fill=26)
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.09))
    warm = Image.new("RGBA", (S, S), (255, 206, 118, 255))
    warm.putalpha(glow)
    tile = Image.alpha_composite(tile, warm)

    # The M: two slanted legs plus the chevron that joins them at the top. The chevron is a
    # stroke, not a filled triangle, so the top keeps its notch and reads as an M, not a plateau.
    mark = Image.new("L", (S, S), 0)
    draw = ImageDraw.Draw(mark)
    draw.polygon(scaled([(238, 758), (350, 262), (440, 262), (326, 758)]), fill=255)
    draw.polygon(scaled([(786, 758), (674, 262), (584, 262), (698, 758)]), fill=255)
    # Endpoints sit inside the legs, so their round joints hide under the apexes.
    draw.line(scaled([(440, 330), (512, 668), (584, 330)]), fill=255, width=92 * SS, joint="curve")
    draw.ellipse(scaled([(440 - 46, 330 - 46), (440 + 46, 330 + 46)]), fill=255)
    draw.ellipse(scaled([(584 - 46, 330 - 46), (584 + 46, 330 + 46)]), fill=255)

    gold = vertical_gradient(S, [(0.0, GOLD_LIGHT), (0.42, GOLD_MID), (1.0, GOLD_DEEP)]).convert("RGBA")
    gold.putalpha(mark)
    tile = Image.alpha_composite(tile, gold)

    # A soft highlight down the mark's upper half: metal, not flat paint.
    sheen = Image.new("L", (S, S), 0)
    ImageDraw.Draw(sheen).rectangle([0, 0, S, int(S * 0.46)], fill=90)
    sheen = ImageChops.multiply(sheen.filter(ImageFilter.GaussianBlur(S * 0.02)), mark)
    highlight = Image.new("RGBA", (S, S), (255, 246, 214, 255))
    highlight.putalpha(sheen)
    tile = Image.alpha_composite(tile, highlight)

    # The spark: a four-point star off the right apex, brighter than the M.
    spark = Image.new("L", (S, S), 0)
    cx, cy, outer, inner = 796, 226, 76, 23
    ImageDraw.Draw(spark).polygon(
        scaled(
            [
                (cx, cy - outer),
                (cx + inner, cy - inner),
                (cx + outer, cy),
                (cx + inner, cy + inner),
                (cx, cy + outer),
                (cx - inner, cy + inner),
                (cx - outer, cy),
                (cx - inner, cy - inner),
            ]
        ),
        fill=255,
    )
    spark_gold = vertical_gradient(S, [(0.0, (255, 247, 213)), (1.0, (233, 183, 84))]).convert("RGBA")
    spark_gold.putalpha(spark.filter(ImageFilter.GaussianBlur(S * 0.0015)))
    tile = Image.alpha_composite(tile, spark_gold)

    # A hairline gold ring just inside the edge, so the tile reads as an app icon.
    ring = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(ring).rounded_rectangle(
        [7 * SS, 7 * SS, S - 7 * SS, S - 7 * SS], radius=(RADIUS - 7) * SS, outline=(236, 200, 128, 60), width=3 * SS
    )
    tile = Image.alpha_composite(tile, ring)

    # Round the corners: everything outside the squircle is transparent.
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=RADIUS * SS, fill=255)
    icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    icon.paste(tile, (0, 0), mask)

    icon = icon.resize((SIZE, SIZE), Image.LANCZOS)
    icon.save(HERE / "icon-source.png")
    print("wrote", HERE / "icon-source.png")


if __name__ == "__main__":
    main()

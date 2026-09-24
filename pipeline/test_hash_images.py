"""Tests der Bild-Hash-Pipeline (scanner-v2-plan.md § 3.4).

Wichtigster Test: der **Paritäts-Vektor**. Dieselben zwei synthetischen 32×32-Graustufen
stehen mit denselben erwarteten Hashes in `app/src/data/imageHash.test.ts` — so fällt
sofort auf, wenn Pipeline und App auseinanderlaufen (dann matcht kein Scan mehr).
Läuft ohne pytest:  python pipeline/test_hash_images.py
"""

import math

import hash_images as hi

N = hi.P_IMG
PARITY_A = [float((x * 7 + y * 13 + (x * y) % 17) % 256) for y in range(N) for x in range(N)]
PARITY_B = [float(((x - 16) ** 2 + (y - 10) ** 2) % 200) for y in range(N) for x in range(N)]
EXPECT_A = "8803b23584d8375d6c87e16a2d775b3ef8424bdc56fa7c1152a755ba7b245c0a"
EXPECT_B = "e15f65779fa89fa8d7ea28819a81d7a02855de8765f59a006787a80197ea605f"


def test_parity_vectors():
    assert hi.phash_from_gray(PARITY_A) == EXPECT_A
    assert hi.phash_from_gray(PARITY_B) == EXPECT_B


def test_bits_to_hex_msb_first():
    assert hi.bits_to_hex([1, 0, 0, 0, 0, 0, 0, 0]) == "80"
    assert hi.bits_to_hex([1] * 8) == "ff"
    assert hi.bits_to_hex([1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1]) == "aa01"


def test_dct_orthonormal():
    c = hi.dct_matrix(N)
    for a in range(0, N, 5):
        for b in range(0, N, 7):
            dot = sum(c[a * N + x] * c[b * N + x] for x in range(N))
            assert math.isclose(dot, 1.0 if a == b else 0.0, abs_tol=1e-9)


def test_hash_is_256_bit_and_brightness_robust():
    h = hi.phash_from_gray(PARITY_A)
    assert len(h) == 64
    brighter = [min(255.0, v * 1.1 + 12) for v in PARITY_A]
    assert hi.hamming_hex(h, hi.phash_from_gray(brighter)) <= 16


def test_hamming():
    assert hi.hamming_hex("00", "ff") == 8
    assert hi.hamming_hex(EXPECT_A, EXPECT_A) == 0


def test_english_printings_standard_first():
    detail = {
        "printing_id": "std",
        "printings": [
            {"id": "beta", "language": "en", "image_url": "u"},
            {"id": "fr", "language": "fr", "image_url": "u"},
            {"id": "std", "language": "en", "image_url": "u"},
            {"id": "noimg", "language": "en", "image_url": None},
        ],
    }
    assert [p["id"] for p in hi.english_printings(detail)] == ["std", "beta"]


def test_classify_alts_by_image_distance():
    std = {"id": "std", "h": "00" * 32}
    reprint = {"id": "beta", "h": "0f" + "00" * 31}  # 4 Bit anders = gleiches Bild
    fullart = {"id": "ncb", "h": "ff" * 8 + "00" * 24}  # 64 Bit anders = anderes Bild
    entries = [std, reprint, fullart]
    hi.classify_alts(entries, "std")
    assert [e["alt"] for e in entries] == [False, False, True]


if __name__ == "__main__":
    n = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            n += 1
    print(f"OK — {n} Tests grün")

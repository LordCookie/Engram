"""Snapshot-Test der Normalisierung (PLAN.md § 5 Aufgabe 2, § 7).

Schuetzt gegen stille Schemaaenderungen der Quelle: ein echtes API-Item wird
normalisiert und gegen das erwartete Card/Printing-Ergebnis geprueft.
Laeuft ohne pytest:  python pipeline/test_fetch_cards.py
"""

from fetch_cards import normalize_card, normalize_printing

# Echtes Item aus api.netdeck.gg (V: Streetkid), gekuerzt auf die relevanten Felder.
SAMPLE = {
    "id": "81a8dec7-9541-4020-93e1-7d798a57dcbc",
    "external_id": "cb-v-streetkid",
    "name": "V",
    "subname": "Streetkid",
    "display_name": "V: Streetkid",
    "slug": "v-streetkid",
    "rules_text": "{Call} Trash 3.",
    "flavor_text": None,
    "printing_id": "3fc63c58-5954-4744-a5af-047bfc5cb159",
    "set": {"code": "welcometonightcityretail", "name": "Welcome to Night City — Retail"},
    "rarity": "Rare",
    "source_image_url": "https://dstcynss47vun.cloudfront.net/prod/cyberpunk/portal/x/render.webp",
    "color": "Red",
    "card_type": "Legend",
    "classifications": ["Merc"],
    "keywords": [],
    "cost": 5,
    "power": 6,
    "ram": 2,
    "print_number": "005a",
}

# Item ohne RAM/Cost (Grenzfall Rebecca — Having a Moment).
SAMPLE_NULLABLE = {
    "slug": "rebecca-having-a-moment",
    "name": "Rebecca",
    "subname": "Having a Moment",
    "set": {"code": "welcometonightcityretail"},
    "rarity": "Rare",
    "color": "Red",
    "card_type": "Legend",
    "classifications": [],
    "keywords": [],
    "cost": None,
    "power": None,
    "ram": None,
    "rules_text": "",
}


def test_normalize_card_full():
    card = normalize_card(SAMPLE)
    assert card == {
        "id": "v-streetkid",
        "setCode": "welcometonightcityretail",
        "name": "V",
        "type": "LEGEND",
        "color": "RED",
        "tags": ["Merc"],
        "rarity": "Rare",
        "rulesText": "{Call} Trash 3.",
        "subtitle": "Streetkid",
        "collectorNumber": "005a",
        "ram": 2,
        "cost": 5,
        "power": 6,
    }, card


def test_normalize_card_nullable():
    card = normalize_card(SAMPLE_NULLABLE)
    # Nullable Felder duerfen NICHT im Ergebnis auftauchen.
    assert "ram" not in card, card
    assert "cost" not in card, card
    assert "power" not in card, card
    assert card["type"] == "LEGEND"
    assert card["color"] == "RED"


def test_normalize_printing():
    p = normalize_printing(SAMPLE)
    assert p["id"] == "3fc63c58-5954-4744-a5af-047bfc5cb159"
    assert p["cardId"] == "v-streetkid"
    assert p["variant"] == "STANDARD"
    assert p["imageUrl"].startswith("https://")
    assert "v-streetkid" in p["pageUrl"]


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"  OK  {t.__name__}")
    print(f"{len(tests)} Tests bestanden.")

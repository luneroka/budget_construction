"""Catalog product -> lot code (spec docs/specs/2026-11-18-lots.md, Appendix B).

Used by the Power BI demo seed, whose data file still names catalog products.
The lots migration keeps its own copy of this mapping.
"""

import unicodedata

# Spec Appendix B. (category, subcategory) -> lot code for every product of
# that subcategory; None means only the listed product exceptions map.
SUBCATEGORY_LOTS: dict[tuple[str, str], str | None] = {
    ('Terrain & Préparation', 'Études & administratif'): '00',
    ('Terrain & Préparation', 'Accès chantier'): '00',
    ('Terrain & Préparation', 'Terrassement'): '01',
    ('Viabilisation', 'Raccordement eau'): '01',
    ('Viabilisation', 'Raccordement électricité'): '01',
    ('Viabilisation', 'Télécom / fibre'): '01',
    ('Viabilisation', 'Assainissement'): '01',
    ('Gros œuvre', 'Fondations'): '02',
    ('Gros œuvre', 'Soubassement / vide sanitaire'): '02',
    ('Gros œuvre', 'Dalle'): '02',
    ('Gros œuvre', 'Élévation murs'): '02',
    ('Gros œuvre', 'Charpente'): '03',
    ('Gros œuvre', 'Couverture'): '04',
    ('Gros œuvre', 'Façades'): '08',
    ('Menuiseries', 'Fenêtres'): '06',
    ('Menuiseries', 'Portes extérieures'): '06',
    ('Menuiseries', 'Volets'): '07',
    ('Second œuvre', 'Isolation'): '10',
    ('Second œuvre', 'Cloisons'): '10',
    ('Second œuvre', 'Électricité'): '12',
    ('Second œuvre', 'Plomberie'): '13',
    ('Second œuvre', 'Chauffage'): '14',
    ('Second œuvre', 'Ventilation'): '14',
    ('Finitions', 'Sols'): None,
    ('Finitions', 'Murs & plafonds'): '17',
    ('Finitions', 'Cuisine'): '20',
    ('Finitions', 'Salle de bain'): '13',
    ('Extérieurs', 'Aménagement terrain'): '18',
    ('Extérieurs', 'Terrasse'): '18',
    ('Extérieurs', 'Allées / accès'): '18',
}

PRODUCT_LOTS: dict[tuple[str, str, str], str] = {
    ('Viabilisation', 'Assainissement', 'Ventilation vide sanitaire'): '02',
    ('Menuiseries', 'Fenêtres', 'Portes intérieures'): '11',
    ('Second œuvre', 'Électricité', 'Réseau KNX'): '23',
    ('Second œuvre', 'Électricité', 'Installation Photovoltaique'): '21',
    ('Finitions', 'Sols', 'Carrelage'): '15',
    ('Finitions', 'Sols', 'Colle'): '15',
    ('Finitions', 'Sols', 'Parquet'): '16',
    ('Finitions', 'Sols', 'Sous-couche'): '16',
    ('Finitions', 'Sols', 'Plinthes'): '16',
    ('Finitions', 'Murs & plafonds', 'Carrelage mural'): '15',
}


def _key(value: str) -> str:
    return unicodedata.normalize('NFC', value).strip().casefold()


_SUBCATEGORY_LOTS = {
    (_key(category), _key(subcategory)): code
    for (category, subcategory), code in SUBCATEGORY_LOTS.items()
}
_PRODUCT_LOTS = {
    (_key(category), _key(subcategory), _key(product)): code
    for (category, subcategory, product), code in PRODUCT_LOTS.items()
}


def lot_code_for(category: str, subcategory: str, product: str) -> str | None:
    """The Appendix B lot code of a catalog product, or None if unmapped."""
    product_key = (_key(category), _key(subcategory), _key(product))
    if product_key in _PRODUCT_LOTS:
        return _PRODUCT_LOTS[product_key]
    return _SUBCATEGORY_LOTS.get(product_key[:2])

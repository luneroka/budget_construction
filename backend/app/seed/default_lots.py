"""The 25 default global lots (spec docs/specs/2026-11-18-lots.md, Appendix A).

Production gets them from the lots migration, which keeps its own copy. This
copy seeds the test database, whose schema is built from the models.
"""

DEFAULT_LOTS: tuple[tuple[str, str], ...] = (
    ('00', 'Préparation de chantier'),
    ('01', 'Terrassement / VRD'),
    ('02', 'Gros œuvre / Maçonnerie'),
    ('03', 'Charpente'),
    ('04', 'Couverture / Zinguerie'),
    ('05', 'Étanchéité'),
    ('06', 'Menuiseries extérieures'),
    ('07', 'Fermetures / Occultations'),
    ('08', 'Ravalement façade'),
    ('09', 'Serrurerie / Métallerie'),
    ('10', 'Cloisons'),
    ('11', 'Menuiseries intérieures'),
    ('12', 'Électricité CFO/CFA'),
    ('13', 'Plomberie / Sanitaires'),
    ('14', 'Chauffage / Ventilation / ECS'),
    ('15', 'Carrelage / Faïence'),
    ('16', 'Sols souples / Parquets'),
    ('17', 'Peinture / Revêtements muraux'),
    ('18', 'Aménagements extérieurs'),
    ('19', 'Nettoyage de fin de chantier'),
    ('20', 'Cuisine équipée'),
    ('21', 'Photovoltaïque / Solaire thermique'),
    ('22', 'Piscine'),
    ('23', 'Domotique'),
    ('24', 'Cheminée / Poêle'),
)

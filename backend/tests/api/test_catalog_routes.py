from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.product import Product
from app.models.subcategory import Subcategory
from tests.helpers import create_authenticated_user


async def test_catalog_tree_requires_authentication(client: AsyncClient) -> None:
    response = await client.get('/catalog/tree')

    assert response.status_code == 401


async def test_catalog_tree_returns_active_hierarchy(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    category = Category(name='Gros œuvre', sort_order=1)
    subcategory = Subcategory(category=category, name='Fondations', sort_order=1)
    db_session.add_all(
        [
            category,
            subcategory,
            Product(subcategory=subcategory, name='Béton', sort_order=1),
            Product(
                subcategory=subcategory,
                name='Produit inactif',
                sort_order=2,
                is_active=False,
            ),
        ]
    )
    await db_session.commit()
    token = await create_authenticated_user(client, email='catalog@example.com')

    response = await client.get(
        '/catalog/tree', headers={'Authorization': f'Bearer {token}'}
    )

    assert response.status_code == 200
    tree = response.json()
    assert [category['name'] for category in tree] == ['Gros œuvre']
    assert [sub['name'] for sub in tree[0]['subcategories']] == ['Fondations']
    assert [
        product['name'] for product in tree[0]['subcategories'][0]['products']
    ] == ['Béton']

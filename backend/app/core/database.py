from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from .config import settings

# SQLite with aiosqlite for async
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if "sqlite" in settings.database_url:
            await migrate_sqlite_schema(conn)


async def migrate_sqlite_schema(conn):
    result = await conn.execute(text("PRAGMA table_info(content_series)"))
    columns = {row[1] for row in result.fetchall()}
    if not columns:
        return
    if "platform" in columns:
        return

    await conn.execute(text("ALTER TABLE content_series ADD COLUMN platform VARCHAR(64)"))
    await conn.execute(
        text(
            """
            UPDATE content_series
            SET platform = COALESCE(
                (
                    SELECT posts.platform
                    FROM series_posts
                    JOIN posts ON posts.id = series_posts.post_id
                    WHERE series_posts.series_id = content_series.id
                    ORDER BY series_posts.offset_minutes ASC
                    LIMIT 1
                ),
                'instagram'
            )
            WHERE platform IS NULL OR platform = ''
            """
        )
    )

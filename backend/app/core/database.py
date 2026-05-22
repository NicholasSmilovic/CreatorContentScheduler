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
    content_series_columns = {row[1]: row for row in result.fetchall()}
    if not content_series_columns:
        return

    if "platform" not in content_series_columns:
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
        result = await conn.execute(text("PRAGMA table_info(content_series)"))
        content_series_columns = {row[1]: row for row in result.fetchall()}

    starts_at_column = content_series_columns.get("starts_at")
    if starts_at_column and starts_at_column[3]:
        await conn.execute(text("PRAGMA foreign_keys=OFF"))
        await conn.execute(
            text(
                """
                CREATE TABLE content_series_new (
                    id INTEGER NOT NULL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    platform VARCHAR(64) NOT NULL,
                    starts_at DATETIME,
                    owner_id INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(owner_id) REFERENCES users (id)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                INSERT INTO content_series_new (
                    id, name, platform, starts_at, owner_id, created_at, updated_at
                )
                SELECT
                    id,
                    name,
                    COALESCE(NULLIF(platform, ''), 'instagram'),
                    starts_at,
                    owner_id,
                    created_at,
                    updated_at
                FROM content_series
                """
            )
        )
        await conn.execute(text("DROP TABLE content_series"))
        await conn.execute(text("ALTER TABLE content_series_new RENAME TO content_series"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_content_series_id ON content_series (id)"))
        await conn.execute(text("PRAGMA foreign_keys=ON"))

    result = await conn.execute(text("PRAGMA table_info(series_posts)"))
    series_post_columns = {row[1]: row for row in result.fetchall()}
    if "position" not in series_post_columns:
        await conn.execute(text("ALTER TABLE series_posts ADD COLUMN position INTEGER"))

    await conn.execute(
        text(
            """
            WITH ordered AS (
                SELECT
                    series_posts.series_id,
                    series_posts.post_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY series_posts.series_id
                        ORDER BY
                            posts.scheduled_at IS NULL,
                            posts.scheduled_at,
                            series_posts.offset_minutes,
                            series_posts.post_id
                    ) AS next_position
                FROM series_posts
                JOIN posts ON posts.id = series_posts.post_id
            )
            UPDATE series_posts
            SET position = (
                SELECT ordered.next_position
                FROM ordered
                WHERE ordered.series_id = series_posts.series_id
                    AND ordered.post_id = series_posts.post_id
            )
            WHERE position IS NULL
            """
        )
    )
    await conn.execute(
        text(
            """
            UPDATE content_series
            SET starts_at = (
                SELECT posts.scheduled_at
                FROM series_posts
                JOIN posts ON posts.id = series_posts.post_id
                WHERE series_posts.series_id = content_series.id
                    AND series_posts.position = 1
                LIMIT 1
            )
            WHERE EXISTS (
                SELECT 1
                FROM series_posts
                WHERE series_posts.series_id = content_series.id
            )
            """
        )
    )
    await conn.execute(
        text(
            """
            UPDATE series_posts
            SET offset_minutes = COALESCE(
                (
                    SELECT CAST(ROUND(
                        (julianday(posts.scheduled_at) - julianday(content_series.starts_at)) * 24 * 60
                    ) AS INTEGER)
                    FROM posts
                    JOIN content_series ON content_series.id = series_posts.series_id
                    WHERE posts.id = series_posts.post_id
                        AND posts.scheduled_at IS NOT NULL
                        AND content_series.starts_at IS NOT NULL
                ),
                offset_minutes
            )
            WHERE position IS NOT NULL
            """
        )
    )
    await conn.execute(text("UPDATE series_posts SET offset_minutes = 0 WHERE position = 1"))

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.core.database import Base


class PostStatus(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    FAILED = "failed"


class Post(Base):
    __tablename__ = "posts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    platform = Column(String(64), nullable=False)  # e.g. youtube, instagram, twitter
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(32), default=PostStatus.DRAFT.value, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    owner = relationship("User", back_populates="posts")
    series_membership = relationship(
        "SeriesPost",
        back_populates="post",
        cascade="all, delete-orphan",
        lazy="selectin",
        uselist=False,
    )

    @property
    def series(self):
        return self.series_membership

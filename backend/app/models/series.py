from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class ContentSeries(Base):
    __tablename__ = "content_series"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    platform = Column(String(64), nullable=False)
    starts_at = Column(DateTime(timezone=True), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    owner = relationship("User", back_populates="series")
    memberships = relationship(
        "SeriesPost",
        back_populates="series",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="SeriesPost.offset_minutes",
    )

    @property
    def posts(self):
        return [membership.post for membership in self.memberships]


class SeriesPost(Base):
    __tablename__ = "series_posts"
    __table_args__ = (UniqueConstraint("post_id", name="uq_series_posts_post_id"),)

    series_id = Column(Integer, ForeignKey("content_series.id"), primary_key=True)
    post_id = Column(Integer, ForeignKey("posts.id"), primary_key=True)
    offset_minutes = Column(Integer, nullable=False)
    role_label = Column(String(128), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    series = relationship("ContentSeries", back_populates="memberships", lazy="joined")
    post = relationship("Post", back_populates="series_membership", lazy="joined")

    @property
    def id(self):
        return self.series_id

    @property
    def name(self):
        return self.series.name

    @property
    def platform(self):
        return self.series.platform

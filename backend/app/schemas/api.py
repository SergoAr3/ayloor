from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.models import (
    MemberRole,
    RunStatus,
    SeasonStatus,
    SubmissionStatus,
    TeamStatus,
)

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,99}$")]
Latitude = Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]
Longitude = Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AuthInput(Input):
    init_data: str = Field(min_length=1, max_length=16384)


class UserOut(ORMModel):
    id: UUID
    telegram_id: int
    username: str | None
    first_name: str | None
    last_name: str | None


class AuthOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class CityOut(ORMModel):
    id: UUID
    slug: str
    name: str
    timezone: str


class SeasonOut(ORMModel):
    id: UUID
    name: str
    slug: str
    status: SeasonStatus
    starts_at: datetime
    ends_at: datetime


class TeamInput(Input):
    name: Name
    city_slug: Slug = "yerevan"


class TeamOut(ORMModel):
    id: UUID
    city_id: UUID
    name: str
    slug: str
    captain_user_id: UUID
    status: TeamStatus
    member_count: int


class MeOut(BaseModel):
    user: UserOut
    team: TeamOut | None
    city: CityOut
    season: SeasonOut | None


class MemberOut(BaseModel):
    user: UserOut
    role: MemberRole
    joined_at: datetime


class InviteInput(Input):
    expires_in_hours: int = Field(default=168, ge=1, le=720)
    max_uses: int = Field(default=4, ge=1, le=100)


class InviteOut(BaseModel):
    code: str
    team: TeamOut
    expires_at: datetime | None
    remaining_uses: int | None
    link: str | None


class RunOut(ORMModel):
    id: UUID
    quest_id: UUID
    team_id: UUID
    status: RunStatus
    started_at: datetime
    completed_at: datetime | None


class QuestOut(BaseModel):
    id: UUID
    title: str
    description: str
    look_for_hint: str | None = None
    hero_image_url: str | None = None
    place_label: str | None = None
    base_xp: int
    latitude: float | None
    longitude: float | None
    radius_m: int | None
    starts_at: datetime | None
    expires_at: datetime | None
    run: RunOut | None


class CheckInInput(Input):
    latitude: Latitude
    longitude: Longitude
    horizontal_accuracy: float = Field(ge=0, allow_inf_nan=False)


class CompletionOut(BaseModel):
    run: RunOut
    awarded_xp: int
    already_completed: bool


class RankingEntry(BaseModel):
    rank: int
    team_id: UUID
    team_name: str
    xp: int


class LeaderboardOut(BaseModel):
    entries: list[RankingEntry]
    current_user_team_rank: int | None
    current_user_team_xp: int | None
    xp_to_next_rank: int | None


class QuestInput(Input):
    city_slug: Slug = "yerevan"
    season_id: UUID
    slug: Slug
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
    description: str = Field(min_length=1, max_length=10000)
    look_for_hint: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
        | None
    ) = None
    hero_image_url: str | None = Field(default=None, max_length=2048)
    place_label: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
        | None
    ) = None

    @field_validator("hero_image_url")
    @classmethod
    def validate_image_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        url = HttpUrl(value)
        if url.scheme != "https" or url.username is not None or url.password is not None:
            raise ValueError("Image URL must use HTTPS without credentials")
        normalized = str(url)
        if len(normalized) > 2048:
            raise ValueError("Normalized image URL must not exceed 2048 characters")
        return normalized

    # Future types exist in the data model, but v0.1 only authors system/location quests.
    quest_type: Literal["location"] = "location"
    verification_level: Literal["system"] = "system"
    base_xp: int = Field(default=100, ge=1, le=100000)
    latitude: Latitude
    longitude: Longitude
    radius_m: int = Field(default=100, ge=1, le=10000)
    starts_at: datetime | None = None
    expires_at: datetime | None = None
    is_active: bool = False

    @model_validator(mode="after")
    def validate_times(self) -> "QuestInput":
        for value in (self.starts_at, self.expires_at):
            if value is not None and value.utcoffset() is None:
                raise ValueError("Quest timestamps must include a timezone")
        if self.starts_at and self.expires_at and self.expires_at <= self.starts_at:
            raise ValueError("expires_at must be after starts_at")
        return self


class QuestAdminOut(ORMModel):
    id: UUID
    city_id: UUID
    season_id: UUID | None
    slug: str
    title: str
    description: str
    look_for_hint: str | None = None
    hero_image_url: str | None = None
    place_label: str | None = None
    base_xp: int
    latitude: float | None
    longitude: float | None
    radius_m: int | None
    starts_at: datetime | None
    expires_at: datetime | None
    is_active: bool


class ActiveInput(Input):
    is_active: bool


class AdjustmentInput(Input):
    team_id: UUID
    season_id: UUID
    amount: int = Field(ge=-100000, le=100000)
    note: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]

    @model_validator(mode="after")
    def nonzero(self) -> "AdjustmentInput":
        if self.amount == 0:
            raise ValueError("amount must be nonzero")
        return self


class ScoreOut(ORMModel):
    id: UUID
    team_id: UUID
    season_id: UUID
    user_id: UUID | None
    quest_run_id: UUID | None
    amount: int
    reason: str
    note: str | None
    created_at: datetime


class SubmissionOut(ORMModel):
    id: UUID
    quest_run_id: UUID
    user_id: UUID
    latitude: float | None
    longitude: float | None
    horizontal_accuracy: float | None
    status: SubmissionStatus
    created_at: datetime

import enum
import uuid
from datetime import date, datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

SCHEMA = "geotech"


class AlertSeverity(str, enum.Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class AlertStatus(str, enum.Enum):
    open = "open"
    acknowledged = "acknowledged"
    resolved = "resolved"


class SensorStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    maintenance = "maintenance"
    decommissioned = "decommissioned"


class InsarJobStatus(str, enum.Enum):
    pending = "pending"
    fetching = "fetching"
    processing = "processing"
    exporting = "exporting"
    completed = "completed"
    failed = "failed"


class InsarRasterKind(str, enum.Enum):
    displacement = "displacement"
    velocity = "velocity"
    coherence = "coherence"
    unwrapped_phase = "unwrapped_phase"


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    boundary = mapped_column(Geometry("MULTIPOLYGON", srid=4326), nullable=True)
    center = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    crs_epsg: Mapped[int] = mapped_column(Integer, default=4326)
    properties: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    terrain_models: Mapped[list["TerrainModel"]] = relationship(back_populates="project")
    insar_images: Mapped[list["InsarImage"]] = relationship(back_populates="project")
    insar_jobs: Mapped[list["InsarProcessingJob"]] = relationship(back_populates="project")
    insar_rasters: Mapped[list["InsarRaster"]] = relationship(back_populates="project")
    displacements: Mapped[list["InsarDisplacement"]] = relationship(
        back_populates="project"
    )
    sensors: Mapped[list["Sensor"]] = relationship(back_populates="project")
    alerts: Mapped[list["Alert"]] = relationship(back_populates="project")
    alert_rules: Mapped["AlertRules | None"] = relationship(
        back_populates="project", uselist=False
    )
    critical_areas: Mapped[list["CriticalArea"]] = relationship(back_populates="project")
    monitoring_observations: Mapped[list["MonitoringObservation"]] = relationship(
        back_populates="project"
    )
    prediction_runs: Mapped[list["PredictionRun"]] = relationship(back_populates="project")


class MonitoringSource(str, enum.Enum):
    rain = "rain"
    gnss = "gnss"
    iot = "iot"


class PredictionStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class AlertRules(Base):
    __tablename__ = "alert_rules"
    __table_args__ = {"schema": SCHEMA}

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE"),
        primary_key=True,
    )
    displacement_mm: Mapped[float] = mapped_column(Float, default=10.0)
    velocity_mm_yr: Mapped[float] = mapped_column(Float, default=5.0)
    coherence_min: Mapped[float] = mapped_column(Float, default=0.4)
    critical_displacement_mm: Mapped[float] = mapped_column(Float, default=20.0)
    critical_velocity_mm_yr: Mapped[float] = mapped_column(Float, default=12.0)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project: Mapped[Project] = relationship(back_populates="alert_rules")


class AlertNotification(Base):
    __tablename__ = "alert_notifications"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE")
    )
    alert_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.alerts.id", ondelete="CASCADE")
    )
    channel: Mapped[str] = mapped_column(String, default="in_app")
    title: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    alert: Mapped["Alert"] = relationship(back_populates="notifications")


class CriticalArea(Base):
    __tablename__ = "critical_areas"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(
            AlertSeverity,
            name="alert_severity",
            schema=SCHEMA,
            create_type=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        default=AlertSeverity.critical,
    )
    geom = mapped_column(Geometry("POLYGON", srid=4326), nullable=False)
    alert_count: Mapped[int] = mapped_column(Integer, default=0)
    max_displacement_mm: Mapped[float | None] = mapped_column(Float)
    properties: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project: Mapped[Project] = relationship(back_populates="critical_areas")


class TerrainModel(Base):
    __tablename__ = "terrain_models"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    model_type: Mapped[str] = mapped_column(String, default="dtm")
    source_uri: Mapped[str | None] = mapped_column(Text)
    acquisition_date: Mapped[date | None] = mapped_column(Date)
    resolution_m: Mapped[float | None] = mapped_column(Float)
    vertical_datum: Mapped[str | None] = mapped_column(String)
    footprint = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)
    extent_3d = mapped_column(Geometry("GEOMETRYZ", srid=4326), nullable=True)
    properties: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project: Mapped[Project] = relationship(back_populates="terrain_models")


class InsarImage(Base):
    __tablename__ = "insar_images"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE")
    )
    scene_id: Mapped[str | None] = mapped_column(String)
    satellite: Mapped[str | None] = mapped_column(String)
    orbit_direction: Mapped[str | None] = mapped_column(String)
    acquisition_date: Mapped[date] = mapped_column(Date, nullable=False)
    processing_level: Mapped[str | None] = mapped_column(String)
    footprint = mapped_column(Geometry("POLYGON", srid=4326), nullable=False)
    bbox_native = mapped_column(Geometry("POLYGON"), nullable=True)
    native_srid: Mapped[int | None] = mapped_column(Integer)
    properties: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    project: Mapped[Project] = relationship(back_populates="insar_images")
    displacements: Mapped[list["InsarDisplacement"]] = relationship(
        back_populates="insar_image"
    )
    rasters: Mapped[list["InsarRaster"]] = relationship(back_populates="insar_image")


class InsarProcessingJob(Base):
    __tablename__ = "insar_processing_jobs"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[InsarJobStatus] = mapped_column(
        Enum(
            InsarJobStatus,
            name="insar_job_status",
            schema=SCHEMA,
            create_type=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        default=InsarJobStatus.pending,
    )
    date_from: Mapped[date] = mapped_column(Date, nullable=False)
    date_to: Mapped[date] = mapped_column(Date, nullable=False)
    reference_date: Mapped[date | None] = mapped_column(Date)
    orbit_direction: Mapped[str | None] = mapped_column(String)
    aoi = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)
    scene_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    properties: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    project: Mapped[Project] = relationship(back_populates="insar_jobs")
    rasters: Mapped[list["InsarRaster"]] = relationship(back_populates="job")


class InsarRaster(Base):
    __tablename__ = "insar_rasters"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE")
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.insar_processing_jobs.id", ondelete="CASCADE"),
    )
    insar_image_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.insar_images.id", ondelete="SET NULL"),
        nullable=True,
    )
    raster_kind: Mapped[InsarRasterKind] = mapped_column(
        Enum(
            InsarRasterKind,
            name="insar_raster_kind",
            schema=SCHEMA,
            create_type=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    epoch_date: Mapped[date | None] = mapped_column(Date)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer)
    crs_epsg: Mapped[int] = mapped_column(Integer, default=4326)
    pixel_size_m: Mapped[float | None] = mapped_column(Float)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    nodata_value: Mapped[float | None] = mapped_column(Float)
    min_value: Mapped[float | None] = mapped_column(Float)
    max_value: Mapped[float | None] = mapped_column(Float)
    mean_value: Mapped[float | None] = mapped_column(Float)
    units: Mapped[str] = mapped_column(String, default="mm")
    footprint = mapped_column(Geometry("POLYGON", srid=4326), nullable=False)
    properties: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    project: Mapped[Project] = relationship(back_populates="insar_rasters")
    job: Mapped[InsarProcessingJob] = relationship(back_populates="rasters")
    insar_image: Mapped[InsarImage | None] = relationship(back_populates="rasters")


class InsarDisplacement(Base):
    __tablename__ = "insar_displacement"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE")
    )
    insar_image_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.insar_images.id", ondelete="CASCADE")
    )
    terrain_model_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.terrain_models.id", ondelete="SET NULL"),
        nullable=True,
    )
    epoch_date: Mapped[date] = mapped_column(Date, nullable=False)
    displacement_mm: Mapped[float] = mapped_column(Float, nullable=False)
    velocity_mm_yr: Mapped[float | None] = mapped_column(Float)
    coherence: Mapped[float | None] = mapped_column(Float)
    los_azimuth_deg: Mapped[float | None] = mapped_column(Float)
    los_incidence_deg: Mapped[float | None] = mapped_column(Float)
    geom = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    properties: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    project: Mapped[Project] = relationship(back_populates="displacements")
    insar_image: Mapped[InsarImage] = relationship(back_populates="displacements")


class Sensor(Base):
    __tablename__ = "sensors"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE")
    )
    sensor_code: Mapped[str] = mapped_column(String, nullable=False)
    sensor_type: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[SensorStatus] = mapped_column(
        Enum(
            SensorStatus,
            name="sensor_status",
            schema=SCHEMA,
            create_type=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        default=SensorStatus.active,
    )
    install_date: Mapped[date | None] = mapped_column(Date)
    depth_m: Mapped[float | None] = mapped_column(Float)
    geom = mapped_column(Geometry("POINTZ", srid=4326), nullable=False)
    orientation = mapped_column(Geometry("LINESTRINGZ", srid=4326), nullable=True)
    properties: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project: Mapped[Project] = relationship(back_populates="sensors")
    observations: Mapped[list["MonitoringObservation"]] = relationship(
        back_populates="sensor"
    )


class MonitoringObservation(Base):
    __tablename__ = "monitoring_observations"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE")
    )
    source: Mapped[MonitoringSource] = mapped_column(
        Enum(
            MonitoringSource,
            name="monitoring_source",
            schema=SCHEMA,
            create_type=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    sensor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.sensors.id", ondelete="CASCADE"),
        nullable=True,
    )
    metric: Mapped[str] = mapped_column(String, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    geom = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    properties: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    project: Mapped[Project] = relationship(back_populates="monitoring_observations")
    sensor: Mapped["Sensor | None"] = relationship(back_populates="observations")


class PredictionRun(Base):
    __tablename__ = "prediction_runs"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE")
    )
    status: Mapped[PredictionStatus] = mapped_column(
        Enum(
            PredictionStatus,
            name="prediction_status",
            schema=SCHEMA,
            create_type=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        default=PredictionStatus.pending,
    )
    horizon_days: Mapped[int] = mapped_column(Integer, default=30)
    model_version: Mapped[str] = mapped_column(String, default="fusion-v1")
    summary: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    project: Mapped[Project] = relationship(back_populates="prediction_runs")
    outputs: Mapped[list["PredictionOutput"]] = relationship(back_populates="run")


class PredictionOutput(Base):
    __tablename__ = "prediction_outputs"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.prediction_runs.id", ondelete="CASCADE"),
    )
    insar_displacement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.insar_displacement.id", ondelete="SET NULL"),
        nullable=True,
    )
    geom = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    forecast_displacement_mm: Mapped[float] = mapped_column(Float, nullable=False)
    rupture_risk: Mapped[float] = mapped_column(Float, nullable=False)
    failure_probability: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    properties: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    run: Mapped[PredictionRun] = relationship(back_populates="outputs")


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.projects.id", ondelete="CASCADE")
    )
    sensor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.sensors.id", ondelete="SET NULL"),
        nullable=True,
    )
    insar_displacement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.insar_displacement.id", ondelete="SET NULL"),
        nullable=True,
    )
    alert_type: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(
            AlertSeverity,
            name="alert_severity",
            schema=SCHEMA,
            create_type=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        default=AlertSeverity.warning,
    )
    status: Mapped[AlertStatus] = mapped_column(
        Enum(
            AlertStatus,
            name="alert_status",
            schema=SCHEMA,
            create_type=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        default=AlertStatus.open,
    )
    parameter_name: Mapped[str | None] = mapped_column(String)
    measured_value: Mapped[float | None] = mapped_column(Float)
    threshold_value: Mapped[float | None] = mapped_column(Float)
    message: Mapped[str | None] = mapped_column(Text)
    geom = mapped_column(Geometry(srid=4326), nullable=True)
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    properties: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    project: Mapped[Project] = relationship(back_populates="alerts")
    notifications: Mapped[list["AlertNotification"]] = relationship(
        back_populates="alert"
    )

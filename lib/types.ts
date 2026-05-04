export type Project = {
  /** Stable unique key (UUID) for links and `projectId` on boreholes */
  id: string;
  /** Auto-generated human-readable project identifier */
  code: string;
  name: string;
  location: string;
  client: string;
  /** ISO 8601 timestamp when the project was created */
  createdAt: string;
};

export type SptReading = {
  depthM: number;
  n1: number;
  n2: number;
  n3: number;
  soilDescription: string;
};

export type BoreholeInput = {
  id: string;
  projectId: string;
  boreholeId: string;
  depthM: number;
  x: number;
  y: number;
  sptReadings: SptReading[];
};

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";

type ToolCommand = {
  command: string;
  versionArgs: string[];
};

type ToolAvailability = {
  ffmpeg: string | null;
  ffprobe: string | null;
  exiftool: string | null;
};

type VideoMetadata = {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  heading: number | null;
  capturedAt: Date | null;
  source: "exiftool" | "ffprobe" | "none";
  raw: Record<string, unknown> | null;
};

export type ExtractedStreetFrame = {
  filePath: string;
  fileName: string;
  frameIndex: number;
  timestamp: Date | null;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  metadata: Record<string, unknown> | null;
};

export type VideoExtractionResult = {
  workingDir: string;
  originalFilePath: string;
  videoId: string;
  tools: ToolAvailability;
  warnings: string[];
  videoMetadata: VideoMetadata;
  frames: ExtractedStreetFrame[];
};

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const normalized = value.replace(/^(\d{4}):(\d{2}):(\d{2}) /, "$1-$2-$3T");
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseIso6709(value: unknown): { latitude: number; longitude: number; altitude: number | null } | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(
    /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?\/?$/,
  );
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  const alt = match[3] ? Number(match[3]) : null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    latitude: lat,
    longitude: lng,
    altitude: alt != null && Number.isFinite(alt) ? alt : null,
  };
}

function firstNonNullNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = parseNumber(value);
    if (parsed != null) return parsed;
  }
  return null;
}

async function runCommand(
  command: string,
  args: string[],
  options?: { cwd?: string },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `${command} terminou com código ${code}.`));
    });
  });
}

async function resolveCommand(candidates: ToolCommand[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await runCommand(candidate.command, candidate.versionArgs);
      return candidate.command;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function detectVideoToolAvailability(): Promise<ToolAvailability> {
  const [ffmpeg, ffprobe, exiftool] = await Promise.all([
    resolveCommand([
      { command: "ffmpeg", versionArgs: ["-version"] },
      { command: "ffmpeg.exe", versionArgs: ["-version"] },
    ]),
    resolveCommand([
      { command: "ffprobe", versionArgs: ["-version"] },
      { command: "ffprobe.exe", versionArgs: ["-version"] },
    ]),
    resolveCommand([
      { command: "exiftool", versionArgs: ["-ver"] },
      { command: "exiftool.exe", versionArgs: ["-ver"] },
    ]),
  ]);

  return { ffmpeg, ffprobe, exiftool };
}

async function readExifToolMetadata(
  command: string,
  filePath: string,
): Promise<Record<string, unknown> | null> {
  const { stdout } = await runCommand(command, ["-j", "-n", filePath]);
  const parsed = JSON.parse(stdout) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const first = parsed[0];
  return first && typeof first === "object" && !Array.isArray(first)
    ? (first as Record<string, unknown>)
    : null;
}

async function readFfprobeMetadata(
  command: string,
  filePath: string,
): Promise<Record<string, unknown> | null> {
  const { stdout } = await runCommand(command, [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);
  const parsed = JSON.parse(stdout) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

function extractVideoMetadata(
  exifData: Record<string, unknown> | null,
  ffprobeData: Record<string, unknown> | null,
): VideoMetadata {
  const exifCoords = parseIso6709(
    exifData?.GPSCoordinates ??
      exifData?.["QuickTime:GPSCoordinates"] ??
      exifData?.["com.apple.quicktime.location.ISO6709"],
  );

  const ffprobeFormat = ffprobeData?.format;
  const ffprobeFormatTags =
    ffprobeFormat && typeof ffprobeFormat === "object" && !Array.isArray(ffprobeFormat)
      ? ((ffprobeFormat as { tags?: unknown }).tags as Record<string, unknown> | undefined)
      : undefined;
  const ffprobeCoords = parseIso6709(
    ffprobeFormatTags?.location ?? ffprobeFormatTags?.["com.apple.quicktime.location.ISO6709"],
  );

  const latitude =
    firstNonNullNumber(
      exifData?.GPSLatitude,
      exifData?.Latitude,
      exifCoords?.latitude,
      ffprobeCoords?.latitude,
    ) ?? null;
  const longitude =
    firstNonNullNumber(
      exifData?.GPSLongitude,
      exifData?.Longitude,
      exifCoords?.longitude,
      ffprobeCoords?.longitude,
    ) ?? null;
  const altitude =
    firstNonNullNumber(exifData?.GPSAltitude, exifCoords?.altitude, ffprobeCoords?.altitude) ??
    null;
  const heading =
    firstNonNullNumber(
      exifData?.GPSImgDirection,
      exifData?.GPSDestBearing,
      exifData?.CompassHeading,
      exifData?.Heading,
    ) ?? null;

  const capturedAt =
    parseDate(
      exifData?.GPSDateTime ??
        exifData?.DateTimeOriginal ??
        exifData?.CreateDate ??
        exifData?.MediaCreateDate ??
        exifData?.TrackCreateDate,
    ) ??
    parseDate(
      ffprobeFormatTags?.creation_time ?? ffprobeFormatTags?.["com.apple.quicktime.creationdate"],
    ) ??
    null;

  if (exifData) {
    return {
      latitude,
      longitude,
      altitude,
      heading,
      capturedAt,
      source: "exiftool",
      raw: exifData,
    };
  }

  if (ffprobeData) {
    return {
      latitude,
      longitude,
      altitude,
      heading,
      capturedAt,
      source: "ffprobe",
      raw: ffprobeData,
    };
  }

  return {
    latitude,
    longitude,
    altitude,
    heading,
    capturedAt,
    source: "none",
    raw: null,
  };
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export async function writeUploadedFileToTemp(
  file: File,
  prefix: string,
): Promise<{ workingDir: string; filePath: string }> {
  const workingDir = await mkdtemp(join(tmpdir(), prefix));
  const safeName = sanitizeSegment(basename(file.name || "upload.bin")) || "upload.bin";
  const filePath = join(workingDir, safeName);
  const bytes = new Uint8Array(await file.arrayBuffer());
  await writeFile(filePath, bytes);
  return { workingDir, filePath };
}

export async function removeTempDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

export async function extractStreetFramesFromVideo(
  file: File,
  videoId: string,
): Promise<VideoExtractionResult> {
  const tools = await detectVideoToolAvailability();
  const warnings: string[] = [];

  const { workingDir, filePath } = await writeUploadedFileToTemp(file, "datageo-video-");
  const framesDir = join(workingDir, "frames");

  let exifData: Record<string, unknown> | null = null;
  let ffprobeData: Record<string, unknown> | null = null;

  if (tools.exiftool) {
    try {
      exifData = await readExifToolMetadata(tools.exiftool, filePath);
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `ExifTool indisponível para metadados do vídeo: ${error.message}`
          : "ExifTool indisponível para metadados do vídeo.",
      );
    }
  } else {
    warnings.push("ExifTool não encontrado; a rota usará apenas metadados do vídeo se o ffprobe estiver disponível.");
  }

  if (tools.ffprobe) {
    try {
      ffprobeData = await readFfprobeMetadata(tools.ffprobe, filePath);
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `FFprobe falhou ao ler metadados do vídeo: ${error.message}`
          : "FFprobe falhou ao ler metadados do vídeo.",
      );
    }
  } else {
    warnings.push("FFprobe não encontrado; alguns metadados de vídeo podem ficar ausentes.");
  }

  if (!tools.ffmpeg) {
    throw new Error(
      "FFmpeg não está disponível no ambiente do servidor. O upload de vídeo foi recebido, mas a extração de frames não pode ser executada.",
    );
  }

  await mkdir(framesDir, { recursive: true });
  await runCommand(tools.ffmpeg, [
    "-y",
    "-i",
    filePath,
    "-vf",
    "fps=1",
    join(framesDir, "frame_%04d.jpg"),
  ]);

  const files = (await readdir(framesDir))
    .filter((fileName) => /\.jpe?g$/i.test(fileName))
    .sort((a, b) => a.localeCompare(b));

  const videoMetadata = extractVideoMetadata(exifData, ffprobeData);
  const frames: ExtractedStreetFrame[] = [];

  for (const [index, fileName] of files.entries()) {
    const framePath = join(framesDir, fileName);
    let frameMetadata: Record<string, unknown> | null = null;
    let frameLat = videoMetadata.latitude;
    let frameLng = videoMetadata.longitude;
    let frameHeading = videoMetadata.heading;

    if (tools.exiftool && (frameLat == null || frameLng == null || frameHeading == null)) {
      try {
        frameMetadata = await readExifToolMetadata(tools.exiftool, framePath);
        frameLat = firstNonNullNumber(frameMetadata?.GPSLatitude, frameLat) ?? null;
        frameLng = firstNonNullNumber(frameMetadata?.GPSLongitude, frameLng) ?? null;
        frameHeading =
          firstNonNullNumber(frameMetadata?.GPSImgDirection, frameMetadata?.Heading, frameHeading) ??
          null;
      } catch {
        // keep inherited metadata
      }
    }

    const timestamp =
      videoMetadata.capturedAt != null
        ? new Date(videoMetadata.capturedAt.getTime() + index * 1000)
        : null;

    frames.push({
      filePath: framePath,
      fileName,
      frameIndex: index,
      timestamp,
      latitude: frameLat,
      longitude: frameLng,
      heading: frameHeading,
      metadata: frameMetadata,
    });
  }

  return {
    workingDir,
    originalFilePath: filePath,
    videoId,
    tools,
    warnings,
    videoMetadata,
    frames,
  };
}

export async function readTempFileBytes(filePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(filePath));
}

export function buildStoredVideoPath(companyId: number, videoId: string, fileName: string): string {
  const ext = extname(fileName) || ".mp4";
  return `${companyId}/${videoId}/original${ext.toLowerCase()}`;
}

export function buildStoredFramePath(
  companyId: number,
  videoId: string,
  frameFileName: string,
): string {
  return `${companyId}/${videoId}/${frameFileName}`;
}

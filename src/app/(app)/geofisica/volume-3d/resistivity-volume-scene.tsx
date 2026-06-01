"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line } from "@react-three/drei";
import * as THREE from "three";
import type { GeophysSurveyLine, ResistivityVolume3D } from "@/lib/geofisica/volume3d/volume3d-types";
import type { VolumeRhoFilter } from "@/lib/geofisica/volume3d/volume-rho-filter";
import { extractHorizontalSlice } from "@/lib/geofisica/volume3d/build-volume-3d";
import {
  extractVerticalSliceX,
  extractVerticalSliceY,
  worldXToIndex,
  worldYToIndex,
} from "@/lib/geofisica/volume3d/volume-slices";
import { lineToLocalSegment } from "@/lib/geofisica/volume3d/line-geometry-3d";
import {
  surfaceSceneY,
  surfaceSceneYAtXY,
} from "@/lib/geofisica/volume3d/volume-terrain-surface";
import { invertResultDepthM } from "@/lib/geofisica/geophys-project/invert-result-serialize";
import {
  sectionTextureDimensions,
  sectionToRgba,
  sliceToRgba,
} from "@/lib/geofisica/volume3d/volume-texture";
import { extractIsosurfaceMesh } from "@/lib/geofisica/3d-engine/iso-surface";
import {
  buildDrapedSectionGeometry,
  sectionUsesTopographyDrape,
} from "@/lib/geofisica/volume3d/volume-section-mesh";
import {
  applyClippingToMaterial,
  createVolumeClipPlanes,
} from "@/lib/geofisica/3d-engine/clipping-planes";
import { BlockModelMesh } from "./block-model-mesh";

export type VolumeSceneProps = {
  volume: ResistivityVolume3D;
  lines: GeophysSurveyLine[];
  depthM: number;
  verticalSliceAxis: "x" | "y";
  verticalSlicePos: number;
  showSections: boolean;
  showHorizontalSlice: boolean;
  showVerticalSlice: boolean;
  showIsosurface: boolean;
  showBlockModel: boolean;
  blockOpacity: number;
  blockDecimate: number;
  logLo: number;
  logHi: number;
  isoLogRho: number;
  sectionOpacity: number;
  sliceOpacity: number;
  isoOpacity: number;
  clipDepthM: number | null;
  clipEnabled: boolean;
  rhoFilter?: VolumeRhoFilter;
};

function makeTexture(rgba: Uint8ClampedArray, w: number, h: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(rgba, w, h, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function HorizontalSlice({
  volume,
  depthM,
  opacity,
  clipPlanes,
  rhoFilter,
}: {
  volume: ResistivityVolume3D;
  depthM: number;
  opacity: number;
  clipPlanes: THREE.Plane[];
  rhoFilter?: VolumeRhoFilter;
}) {
  const { nx, ny, boundsM, cellSizeM } = volume;
  const k = Math.max(0, Math.min(volume.nz - 1, Math.floor(depthM / cellSizeM.z)));

  const texture = useMemo(() => {
    const slice = extractHorizontalSlice(volume, k);
    const rgba = sliceToRgba(slice, nx, ny, undefined, rhoFilter);
    return makeTexture(rgba, nx, ny);
  }, [volume, k, nx, ny, rhoFilter]);

  const cx = (boundsM.minX + boundsM.maxX) / 2;
  const cz = (boundsM.minY + boundsM.maxY) / 2;
  const w = boundsM.maxX - boundsM.minX;
  const d = boundsM.maxY - boundsM.minY;

  const sliceY = useMemo(() => {
    if (!volume.followTerrain || !volume.surfaceM) return -depthM;
    let sum = 0;
    let n = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        sum += surfaceSceneY(volume, i, j);
        n++;
      }
    }
    const meanSurfaceY = n > 0 ? sum / n : 0;
    return meanSurfaceY - depthM;
  }, [volume, depthM, nx, ny]);

  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    applyClippingToMaterial(m, clipPlanes);
    return m;
  }, [texture, opacity, clipPlanes]);

  return (
    <mesh position={[cx, sliceY, cz]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[w, d]} />
    </mesh>
  );
}

function TerrainSurfaceMesh({ volume }: { volume: ResistivityVolume3D }) {
  const geometry = useMemo(() => {
    if (!volume.followTerrain || !volume.surfaceM) return null;
    const { nx, ny, boundsM } = volume;
    const w = boundsM.maxX - boundsM.minX;
    const d = boundsM.maxY - boundsM.minY;
    const geo = new THREE.PlaneGeometry(w, d, nx - 1, ny - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position!;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const vi = i + j * nx;
        pos.setY(vi, surfaceSceneY(volume, i, j));
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [volume]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#78716c",
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        metalness: 0,
        roughness: 0.95,
        wireframe: false,
      }),
    [],
  );

  if (!geometry) return null;

  const cx = (volume.boundsM.minX + volume.boundsM.maxX) / 2;
  const cz = (volume.boundsM.minY + volume.boundsM.maxY) / 2;

  return <mesh geometry={geometry} material={material} position={[cx, 0, cz]} />;
}

function VerticalSlice({
  volume,
  axis,
  posM,
  opacity,
  clipPlanes,
  rhoFilter,
}: {
  volume: ResistivityVolume3D;
  axis: "x" | "y";
  posM: number;
  opacity: number;
  clipPlanes: THREE.Plane[];
  rhoFilter?: VolumeRhoFilter;
}) {
  const { nx, ny, nz, boundsM } = volume;

  const { texture, w, h, position, rotation } = useMemo(() => {
    if (axis === "x") {
      const i = worldXToIndex(volume, posM);
      const slice = extractVerticalSliceX(volume, i);
      const rgba = sliceToRgba(slice, ny, nz, undefined, rhoFilter);
      const tex = makeTexture(rgba, ny, nz);
      const x = boundsM.minX + (i + 0.5) * volume.cellSizeM.x;
      const depth = boundsM.maxZ;
      const width = boundsM.maxY - boundsM.minY;
      return {
        texture: tex,
        w: width,
        h: depth,
        position: [x, -depth / 2, (boundsM.minY + boundsM.maxY) / 2] as [
          number,
          number,
          number,
        ],
        rotation: [0, Math.PI / 2, 0] as [number, number, number],
      };
    }
    const j = worldYToIndex(volume, posM);
    const slice = extractVerticalSliceY(volume, j);
    const rgba = sliceToRgba(slice, nx, nz, undefined, rhoFilter);
    const tex = makeTexture(rgba, nx, nz);
    const z = boundsM.minY + (j + 0.5) * volume.cellSizeM.y;
    const depth = boundsM.maxZ;
    const width = boundsM.maxX - boundsM.minX;
    return {
      texture: tex,
      w: width,
      h: depth,
      position: [(boundsM.minX + boundsM.maxX) / 2, -depth / 2, z] as [
        number,
        number,
        number,
      ],
      rotation: [0, 0, 0] as [number, number, number],
    };
  }, [volume, axis, posM, boundsM, nx, ny, nz, rhoFilter]);

  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    applyClippingToMaterial(m, clipPlanes);
    return m;
  }, [texture, opacity, clipPlanes]);

  return (
    <mesh position={position} rotation={rotation} material={material}>
      <planeGeometry args={[w, h]} />
    </mesh>
  );
}

function IsosurfaceMesh({
  volume,
  isoLogRho,
  opacity,
  clipPlanes,
}: {
  volume: ResistivityVolume3D;
  isoLogRho: number;
  opacity: number;
  clipPlanes: THREE.Plane[];
}) {
  const geo = useMemo(() => {
    const { positions, indices } = extractIsosurfaceMesh(volume, isoLogRho);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setIndex(new THREE.BufferAttribute(indices, 1));
    g.computeVertexNormals();
    return g;
  }, [volume, isoLogRho]);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: "#f59e0b",
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      metalness: 0.1,
      roughness: 0.6,
    });
    applyClippingToMaterial(m, clipPlanes);
    return m;
  }, [opacity, clipPlanes]);

  if (geo.attributes.position!.count === 0) return null;

  return <mesh geometry={geo} material={material} />;
}

function SectionPlane({
  line,
  volume,
  anchorLat,
  anchorLng,
  opacity,
  clipPlanes,
}: {
  line: GeophysSurveyLine;
  volume: ResistivityVolume3D;
  anchorLat: number;
  anchorLng: number;
  opacity: number;
  clipPlanes: THREE.Plane[];
}) {
  const seg = useMemo(
    () => lineToLocalSegment(line.id, line.name, line.geometry, anchorLat, anchorLng),
    [line, anchorLat, anchorLng],
  );

  const drape = sectionUsesTopographyDrape(line, volume);

  const texture = useMemo(() => {
    if (!line.invertResult) return null;
    const { width, height } = sectionTextureDimensions(line.invertResult);
    const rgba = sectionToRgba(line.invertResult, width, height);
    return makeTexture(rgba, width, height);
  }, [line.invertResult]);

  const drapedGeometry = useMemo(() => {
    if (!drape || !line.invertResult) return null;
    return buildDrapedSectionGeometry(line, line.invertResult, volume, seg);
  }, [drape, line, volume, seg]);

  const material = useMemo(() => {
    if (!texture) return null;
    const m = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    m.renderOrder = 20;
    applyClippingToMaterial(m, clipPlanes);
    return m;
  }, [texture, opacity, clipPlanes]);

  if (!material || !line.invertResult) return null;

  if (drape && drapedGeometry) {
    return <mesh geometry={drapedGeometry} material={material} />;
  }

  const sectionDepthM = invertResultDepthM(line.invertResult);
  const mx = (seg.start.x + seg.end.x) / 2;
  const mz = (seg.start.y + seg.end.y) / 2;
  const angle = Math.atan2(seg.end.x - seg.start.x, seg.end.y - seg.start.y);
  const centerY = volume.followTerrain
    ? (surfaceSceneYAtXY(volume, seg.start.x, seg.start.y) +
        surfaceSceneYAtXY(volume, seg.end.x, seg.end.y)) /
        2 -
      sectionDepthM / 2
    : -sectionDepthM / 2;

  return (
    <mesh position={[mx, centerY, mz]} rotation={[0, angle, 0]} material={material}>
      <planeGeometry args={[seg.lengthM, sectionDepthM]} />
    </mesh>
  );
}

function SurveyLineGuides({
  lines,
  volume,
  anchorLat,
  anchorLng,
}: {
  lines: GeophysSurveyLine[];
  volume: ResistivityVolume3D;
  anchorLat: number;
  anchorLng: number;
}) {
  return (
    <>
      {lines.map((line) => {
        const seg = lineToLocalSegment(
          line.id,
          line.name,
          line.geometry,
          anchorLat,
          anchorLng,
        );
        const y0 = volume.followTerrain
          ? surfaceSceneYAtXY(volume, seg.start.x, seg.start.y) + 0.5
          : 0.5;
        const y1 = volume.followTerrain
          ? surfaceSceneYAtXY(volume, seg.end.x, seg.end.y) + 0.5
          : 0.5;
        const points: [number, number, number][] = [
          [seg.start.x, y0, seg.start.y],
          [seg.end.x, y1, seg.end.y],
        ];
        return (
          <Line key={line.id} points={points} color="#0d9488" lineWidth={2} />
        );
      })}
    </>
  );
}

function SceneContent(props: VolumeSceneProps) {
  const { volume, lines, clipEnabled, clipDepthM, boundsM } = {
    ...props,
    boundsM: props.volume.boundsM,
  };

  const clipPlanes = useMemo(
    () =>
      createVolumeClipPlanes({
        clipDepthM,
        boundsMaxZ: boundsM.maxZ,
        enabled: clipEnabled,
      }),
    [clipDepthM, boundsM.maxZ, clipEnabled],
  );

  const cx = (boundsM.minX + boundsM.maxX) / 2;
  const cz = (boundsM.minY + boundsM.maxY) / 2;
  const span = Math.max(
    boundsM.maxX - boundsM.minX,
    boundsM.maxY - boundsM.minY,
    boundsM.maxZ,
    80,
  );

  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[span, span * 2, span]} intensity={0.6} />
      <OrbitControls
        target={[cx, -boundsM.maxZ / 3, cz]}
        maxPolarAngle={Math.PI / 2 + 0.15}
      />
      <gridHelper
        args={[span * 1.4, 20, "#64748b", "#334155"]}
        position={[cx, 0, cz]}
      />

      <SurveyLineGuides
        lines={lines}
        volume={volume}
        anchorLat={volume.anchorLat}
        anchorLng={volume.anchorLng}
      />

      {volume.followTerrain && <TerrainSurfaceMesh volume={volume} />}

      {props.showHorizontalSlice && (
        <HorizontalSlice
          volume={volume}
          depthM={props.depthM}
          opacity={props.sliceOpacity}
          clipPlanes={clipPlanes}
          rhoFilter={props.rhoFilter}
        />
      )}

      {props.showVerticalSlice && (
        <VerticalSlice
          volume={volume}
          axis={props.verticalSliceAxis}
          posM={props.verticalSlicePos}
          opacity={props.sliceOpacity}
          clipPlanes={clipPlanes}
          rhoFilter={props.rhoFilter}
        />
      )}

      {props.showBlockModel && (
        <BlockModelMesh
          volume={volume}
          logLo={props.logLo}
          logHi={props.logHi}
          opacity={props.blockOpacity}
          decimate={props.blockDecimate}
          clipDepthM={clipEnabled ? clipDepthM : null}
          clipPlanes={clipPlanes}
          rhoFilter={props.rhoFilter}
          deferToSections={props.showSections}
        />
      )}

      {props.showSections &&
        lines.map((line) =>
          line.invertResult ? (
            <SectionPlane
              key={line.id}
              line={line}
              volume={volume}
              anchorLat={volume.anchorLat}
              anchorLng={volume.anchorLng}
              opacity={props.sectionOpacity}
              clipPlanes={clipPlanes}
            />
          ) : null,
        )}

      {props.showIsosurface && (
        <IsosurfaceMesh
          volume={volume}
          isoLogRho={props.isoLogRho}
          opacity={props.isoOpacity}
          clipPlanes={clipPlanes}
        />
      )}
    </>
  );
}

export function ResistivityVolumeScene(props: VolumeSceneProps) {
  const { boundsM } = props.volume;
  const cx = (boundsM.minX + boundsM.maxX) / 2;
  const cz = (boundsM.minY + boundsM.maxY) / 2;
  const span = Math.max(
    boundsM.maxX - boundsM.minX,
    boundsM.maxY - boundsM.minY,
    boundsM.maxZ,
    100,
  );

  return (
    <div className="h-full min-h-[480px] w-full rounded-lg border border-[var(--border)] bg-slate-950">
      <Canvas
        camera={{
          position: [cx + span * 0.8, span * 0.6, cz + span * 0.8],
          fov: 45,
          near: 0.1,
          far: span * 20,
        }}
        gl={{
          antialias: true,
          alpha: true,
          localClippingEnabled: true,
        }}
      >
        <SceneContent {...props} />
      </Canvas>
    </div>
  );
}

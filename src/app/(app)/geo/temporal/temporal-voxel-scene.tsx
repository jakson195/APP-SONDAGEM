"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { TemporalChangeAnalysis } from "@/lib/geo/temporal/temporal-types";

function VoxelStack({ change }: { change: TemporalChangeAnalysis }) {
  const { nx, ny, values } = change.heatmapGrid;
  const nz = 8;

  const meshes = useMemo(() => {
    const out: { pos: [number, number, number]; color: THREE.Color; scale: number }[] = [];
    for (let k = 0; k < nz; k++) {
      const t = k / (nz - 1);
      for (let j = 0; j < ny; j += 2) {
        for (let i = 0; i < nx; i += 2) {
          const v = (values[i + j * nx] ?? 0) * (0.5 + t * 0.5);
          if (v < 0.05) continue;
          const x = (i / nx - 0.5) * 8;
          const z = (j / ny - 0.5) * 8;
          const y = k * 0.35;
          const c = new THREE.Color();
          c.setHSL(0.05 + (1 - t) * 0.25, 0.9, 0.35 + v * 0.4);
          out.push({ pos: [x, y, z], color: c, scale: 0.15 + v * 0.25 });
        }
      }
    }
    return out;
  }, [change, nx, ny, values, nz]);

  return (
    <group>
      {meshes.map((m, idx) => (
        <mesh key={idx} position={m.pos} scale={m.scale}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={m.color} transparent opacity={0.85} />
        </mesh>
      ))}
    </group>
  );
}

export function TemporalVoxelScene({ change }: { change: TemporalChangeAnalysis }) {
  return (
    <div className="h-[320px] overflow-hidden rounded-lg bg-slate-950">
      <Canvas camera={{ position: [6, 8, 10], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} intensity={0.9} />
        <VoxelStack change={change} />
        <OrbitControls enableDamping />
      </Canvas>
    </div>
  );
}

"use client";

import { Canvas } from "@react-three/fiber";
import type { FuroCena3D } from "../furos-mapa-para-cena-3d";

export type Scene3DProps = {
  furos: FuroCena3D[];
};

export default function Scene3D({ furos }: Scene3DProps) {
  return (
    <div className="h-full min-h-[220px] w-full">
      <Canvas
        camera={{ position: [0, 50, 100], fov: 50 }}
        className="h-full w-full"
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.65} />
        <pointLight position={[10, 10, 10]} intensity={1.1} />

        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="lightgreen" />
        </mesh>

        {furos.map((f) => (
          <mesh key={f.id} position={[f.x, -5, f.y]}>
            <cylinderGeometry args={[0.5, 0.5, 10]} />
            <meshStandardMaterial color="black" />
          </mesh>
        ))}
      </Canvas>
    </div>
  );
}

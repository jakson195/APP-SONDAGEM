import type { ReactNode } from "react";
import { ssgFuroIdSegmentParams } from "@/lib/ssg-static-params-from-db";

export async function generateStaticParams() {
  return ssgFuroIdSegmentParams();
}

export default function RotativaFuroLayout({ children }: { children: ReactNode }) {
  return children;
}

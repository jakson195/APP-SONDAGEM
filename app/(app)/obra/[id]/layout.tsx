import type { ReactNode } from "react";
import { ssgObraIdParams } from "@/lib/ssg-static-params-from-db";

export async function generateStaticParams() {
  return ssgObraIdParams();
}

export default function ObraIdLayout({ children }: { children: ReactNode }) {
  return children;
}

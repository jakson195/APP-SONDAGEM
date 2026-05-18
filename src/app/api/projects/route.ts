import { NextResponse } from "next/server";
import { listProjects } from "@/lib/projects";

export const dynamic = "force-static";

/** Returns built-in projects only; browser-created projects live in localStorage via `useProjects()`. */
export async function GET() {
  try {
    const projects = listProjects();
    return NextResponse.json({ projects });
  } catch {
    return NextResponse.json(
      { error: "Failed to load projects", projects: [] },
      { status: 500 },
    );
  }
}

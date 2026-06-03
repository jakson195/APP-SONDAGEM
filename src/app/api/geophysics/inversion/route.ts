/**
 * Alias estável SaaS: POST /api/geophysics/inversion → inversão 2D FDM/FEM.
 * Reexporta a mesma lógica de `/api/geofisica/invert/2d`.
 */
export {
  GET,
  POST,
  maxDuration,
  dynamic,
} from "@/app/api/geofisica/invert/2d/route";

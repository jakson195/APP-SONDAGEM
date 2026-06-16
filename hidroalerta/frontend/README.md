# HidroAlerta Frontend

Dashboard de previsão de enchentes (MVP com dados mockados).

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Recharts
- Lucide icons

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Dev server (:5174) |
| `npm run build` | Build produção |
| `npm run preview` | Preview do build |

## Mapbox (opcional)

Com `VITE_MAPBOX_TOKEN` no `.env`, substituir o placeholder em `FloodMap.tsx` por `mapbox-gl`.

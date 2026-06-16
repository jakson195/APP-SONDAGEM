"""Resumo descritivo de feições ANM SIGMINE."""


def build_mining_summary(feature: dict) -> str:
    process = feature.get("process_number") or feature.get("code") or "—"
    phase = feature.get("phase") or ""
    holder = feature.get("holder") or feature.get("name") or ""
    substance = feature.get("substance") or ""
    use_type = feature.get("use_type") or ""
    area = feature.get("area_ha")
    uf = feature.get("uf") or ""

    parts: list[str] = [f"Processo minerário ANM {process}."]
    if phase:
        parts.append(f"Fase: {phase}.")
    if holder:
        parts.append(f"Titular: {holder}.")
    if substance:
        parts.append(f"Substância: {substance}.")
    if use_type:
        parts.append(f"Uso: {use_type}.")
    if area:
        parts.append(f"Área: {float(area):,.1f} ha.")
    if uf:
        parts.append(f"UF: {uf}.")
    return " ".join(parts)


def enrich_mining_feature(feature: dict) -> dict:
    out = dict(feature)
    out["mining_summary"] = build_mining_summary(out)
    out["source"] = out.get("source") or "ANM — SIGMINE"
    return out

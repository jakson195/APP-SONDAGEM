import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { computeNspt } from "@/lib/spt";
import { buildSoilProfile, profileDiagramSpanM } from "@/lib/soil-profile";
import type { BoreholeInput, Project, SptReading } from "@/lib/types";

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 48,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#0f172a",
    lineHeight: 1.35,
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    color: "#0f766e",
  },
  subtitle: {
    fontSize: 9,
    color: "#64748b",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 8,
    color: "#0f172a",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 4,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  metaItem: {
    width: "48%",
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 8,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#94a3b8",
    paddingVertical: 6,
    backgroundColor: "#f1f5f9",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 5,
  },
  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#334155",
  },
  td: {
    fontSize: 8,
    color: "#0f172a",
  },
  colDepth: { width: "14%" },
  colN: { width: "9%" },
  colNspt: { width: "11%" },
  colDesc: { width: "48%" },
  diagramWrap: {
    marginTop: 8,
    height: 168,
    flexDirection: "column",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 2,
    overflow: "hidden",
  },
  layerBox: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    justifyContent: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  layerBoxAlt: {
    backgroundColor: "#f8fafc",
  },
  layerDepthNote: {
    fontSize: 7,
    color: "#64748b",
    marginBottom: 2,
  },
  layerDesc: {
    fontSize: 8,
    color: "#0f172a",
  },
  caption: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 6,
    fontStyle: "italic",
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 44,
    right: 44,
    fontSize: 8,
    color: "#94a3b8",
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
  },
});

const DIAGRAM_HEIGHT = 168;

function formatNum(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(decimals);
}

function sortedSptRows(readings: SptReading[]): SptReading[] {
  return [...readings].sort((a, b) => a.depthM - b.depthM);
}

type Props = {
  borehole: BoreholeInput;
  project: Project;
  generatedAt: Date;
};

export function BoreholeReportDocument({
  borehole,
  project,
  generatedAt,
}: Props) {
  const layers = buildSoilProfile(borehole.sptReadings, borehole.depthM);
  const spanM = profileDiagramSpanM(layers, borehole.depthM);
  const rows = sortedSptRows(borehole.sptReadings);

  const sumThickness = layers.reduce(
    (s, l) => s + Math.max(l.toM - l.fromM, 0),
    0,
  );

  return (
    <Document
      title={`Borehole ${borehole.boreholeId}`}
      author="Vision Sondagem"
      subject="Geotechnical borehole report"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Borehole investigation report</Text>
        <Text style={styles.subtitle}>
          Vision Sondagem · Geotechnical drilling
        </Text>

        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Project ID</Text>
            <Text style={styles.metaValue}>{project.code}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Project</Text>
            <Text style={styles.metaValue}>{project.name}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Location</Text>
            <Text style={styles.metaValue}>{project.location}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Client</Text>
            <Text style={styles.metaValue}>{project.client}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Borehole ID</Text>
            <Text style={styles.metaValue}>{borehole.boreholeId}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Coordinates (X / Y)</Text>
            <Text style={styles.metaValue}>
              {formatNum(borehole.x)} / {formatNum(borehole.y)}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Total depth (m)</Text>
            <Text style={styles.metaValue}>{formatNum(borehole.depthM)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Project created</Text>
            <Text style={styles.metaValue}>
              {new Date(project.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Report date</Text>
            <Text style={styles.metaValue}>
              {generatedAt.toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Standard Penetration Test (SPT)</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colDepth]}>Depth (m)</Text>
          <Text style={[styles.th, styles.colN]}>N1</Text>
          <Text style={[styles.th, styles.colN]}>N2</Text>
          <Text style={[styles.th, styles.colN]}>N3</Text>
          <Text style={[styles.th, styles.colNspt]}>NSPT</Text>
          <Text style={[styles.th, styles.colDesc]}>Soil description</Text>
        </View>
        {rows.length === 0 ? (
          <Text style={[styles.td, { paddingVertical: 8 }]}>
            No SPT intervals recorded.
          </Text>
        ) : (
          rows.map((r, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.td, styles.colDepth]}>
                {formatNum(r.depthM)}
              </Text>
              <Text style={[styles.td, styles.colN]}>{r.n1}</Text>
              <Text style={[styles.td, styles.colN]}>{r.n2}</Text>
              <Text style={[styles.td, styles.colN]}>{r.n3}</Text>
              <Text style={[styles.td, styles.colNspt]}>
                {computeNspt(r.n2, r.n3)}
              </Text>
              <Text style={[styles.td, styles.colDesc]}>
                {r.soilDescription.trim() || "—"}
              </Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Soil profile</Text>
        <Text style={{ fontSize: 8, color: "#64748b", marginBottom: 6 }}>
          Layer thickness in the diagram is proportional to depth interval (full
          span {formatNum(spanM)} m). NSPT shown at each sampled horizon.
        </Text>

        <View style={styles.diagramWrap}>
          {layers.length === 0 ? (
            <View style={{ padding: 12, justifyContent: "center" }}>
              <Text style={styles.layerDesc}>
                No layers — enter SPT rows with depth &gt; 0 and descriptions to
                build a soil profile.
              </Text>
            </View>
          ) : (
            layers.map((layer, i) => {
              const thick = Math.max(layer.toM - layer.fromM, 0);
              const flexWeight =
                sumThickness > 0
                  ? thick / sumThickness
                  : 1 / layers.length;
              return (
                <View
                  key={`${layer.fromM}-${layer.toM}-${i}`}
                  style={[
                    styles.layerBox,
                    i % 2 === 1 ? styles.layerBoxAlt : {},
                    {
                      flex: flexWeight,
                      minHeight: thick > 0 ? 16 : 0,
                    },
                  ]}
                >
                  <Text style={styles.layerDepthNote}>
                    {formatNum(layer.fromM, 2)} – {formatNum(layer.toM, 2)} m
                    {layer.nspt !== undefined ? ` · NSPT ${layer.nspt}` : ""}
                  </Text>
                  <Text style={styles.layerDesc}>{layer.description}</Text>
                </View>
              );
            })
          )}
        </View>

        <Text style={styles.caption}>
          NSPT = N2 + N3 at each sampling depth. Profile layers follow field
          descriptions between consecutive sample depths.
        </Text>

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Vision Sondagem · ${borehole.boreholeId} · Page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}

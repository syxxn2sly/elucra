/**
 * CLAIRITY — the shape of a measure over time.
 *
 * Deliberately descriptive, never evaluative. It says "down 6 since March", not
 * "improving"; it draws the line and leaves the reading of it to the person who
 * knows the context. A home blood-pressure series taken at different times of
 * day, on an unvalidated cuff, is not something an app should be grading.
 *
 * Drawn with react-native-svg, already a dependency. Blood pressure gets two
 * lines because systolic and diastolic move independently and averaging them
 * would invent a number nobody measured.
 */

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";

import Colors from "@/constants/colors";
import { Font, Space, Type } from "@/constants/theme";
import { formatDateDisplay } from "@/lib/utils";
import { vitalDefinition } from "@/lib/vitals-data";
import type { VitalReading } from "@/lib/types";

const C = Colors.light;

const CHART_HEIGHT = 96;
const PADDING_Y = 10;
/** Enough that the marker dot on the newest reading is not clipped in half. */
const PADDING_X = 5;

/** Below this a line is noise rather than a trend. */
const MIN_POINTS_FOR_TREND = 2;

interface Point {
  /** 0–1 across the recorded span, by time rather than by position. */
  t: number;
  value: number;
}

interface Series {
  label: string;
  points: Point[];
  colour: string;
}

function xFor(t: number, width: number): number {
  return PADDING_X + t * Math.max(0, width - PADDING_X * 2);
}

/**
 * SVG y grows downward, so a high reading has to sit near the top.
 */
function yFor(value: number, min: number, max: number): number {
  const span = max - min || 1;
  return PADDING_Y + (1 - (value - min) / span) * (CHART_HEIGHT - PADDING_Y * 2);
}

function polyline(points: Point[], min: number, max: number, width: number): string {
  return points
    .map((point) => `${xFor(point.t, width).toFixed(1)},${yFor(point.value, min, max).toFixed(1)}`)
    .join(" ");
}

export function VitalTrend({
  readings,
  width,
}: {
  /** Newest first, as the store keeps them. */
  readings: VitalReading[];
  width: number;
}) {
  const definition = vitalDefinition(readings[0]?.kind ?? "weight");

  const { series, min, max, oldest, newest, changes } = useMemo(() => {
    // Oldest first for drawing: a chart reads left to right through time. Sorted
    // rather than reversed, so a backdated reading lands where it belongs.
    const ordered = [...readings].sort((a, b) => a.takenAt.localeCompare(b.takenAt));

    /*
      Spacing blends time and order, because neither alone is readable.

      Purely by time is what a chart "should" do, and it fails badly on real
      data: three readings taken the same afternoon land on the same x, the line
      between them goes vertical, and the whole series reads as a cliff. Purely
      by order is always legible but implies a regular cadence that home readings
      never have — a week of daily readings and a five-month gap would look the
      same.

      Weighting time at TIME_WEIGHT keeps a long gap visibly long while
      guaranteeing every reading its own x, at least (1 - TIME_WEIGHT) / (n - 1)
      of the width from its neighbour. The dates under the chart remain the
      precise statement; this is the shape.
    */
    const TIME_WEIGHT = 0.65;

    const first = new Date(ordered[0].takenAt).getTime();
    const last = new Date(ordered[ordered.length - 1].takenAt).getTime();
    const timeSpan = last - first;

    const build = (pick: (r: VitalReading) => number | null): Point[] => {
      const values = ordered
        .map((reading) => ({ time: new Date(reading.takenAt).getTime(), value: pick(reading) }))
        .filter((entry): entry is { time: number; value: number } => entry.value !== null);

      return values.map((entry, index) => {
        const byOrder = values.length > 1 ? index / (values.length - 1) : 0;
        // Everything on one instant has no time axis to speak of; use the order.
        const byTime = timeSpan > 0 ? (entry.time - first) / timeSpan : byOrder;
        return { t: TIME_WEIGHT * byTime + (1 - TIME_WEIGHT) * byOrder, value: entry.value };
      });
    };

    const built: Series[] = definition.paired
      ? [
          { label: definition.paired.firstLabel, points: build((r) => r.systolic), colour: C.primary },
          { label: definition.paired.secondLabel, points: build((r) => r.diastolic), colour: C.accent },
        ]
      : [{ label: definition.label, points: build((r) => r.value), colour: C.primary }];

    const all = built.flatMap((s) => s.points.map((point) => point.value));
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    // A flat series would divide by zero and draw on the axis; give it room.
    const pad = (hi - lo || Math.max(1, hi * 0.05)) * 0.15;

    const changes = built.map((entry) => ({
      label: entry.label,
      delta: entry.points[entry.points.length - 1].value - entry.points[0].value,
    }));

    return {
      series: built,
      min: lo - pad,
      max: hi + pad,
      oldest: ordered[0],
      newest: ordered[ordered.length - 1],
      changes,
    };
  }, [readings, definition]);

  if (readings.length < MIN_POINTS_FOR_TREND) return null;

  const chartWidth = Math.max(1, width);
  const decimals = definition.decimals;
  const firstLabel = formatDateDisplay(oldest.takenAt);
  const lastLabel = formatDateDisplay(newest.takenAt);

  return (
    <View style={styles.wrap}>
      <Svg width={chartWidth} height={CHART_HEIGHT}>
        {series.map((s) => (
          <React.Fragment key={s.label}>
            <Polyline
              points={polyline(s.points, min, max, chartWidth)}
              fill="none"
              stroke={s.colour}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/*
              One dot per reading, with the newest drawn larger. Without them a
              cluster of readings taken days apart is indistinguishable from a
              single point, which is the thing time-spacing exists to show.
            */}
            {s.points.map((point, index) => (
              <Circle
                key={`${s.label}-${index}`}
                cx={xFor(point.t, chartWidth)}
                cy={yFor(point.value, min, max)}
                r={index === s.points.length - 1 ? 3.5 : 2}
                fill={s.colour}
              />
            ))}
          </React.Fragment>
        ))}
      </Svg>

      {/*
        A series recorded inside a single day would otherwise print that day
        twice, at both ends, which reads as a rendering fault rather than as
        "this all happened on one day". One centred label says it plainly.
      */}
      {firstLabel === lastLabel ? (
        <View style={styles.axisSingle}>
          <Text style={styles.axisText}>{firstLabel}</Text>
        </View>
      ) : (
        <View style={styles.axis}>
          <Text style={styles.axisText}>{firstLabel}</Text>
          <Text style={styles.axisText}>{lastLabel}</Text>
        </View>
      )}

      {/*
        A statement of fact about the numbers, with no adjective attached.
        "Down 6" is something the reader can take to a clinician; "improving"
        would be the app deciding what the numbers mean.

        Paired measures name which number moved — "down 14" over a blood
        pressure chart silently means the systolic, and leaving that to be
        inferred is how a number gets quoted back wrong.
      */}
      <Text style={styles.summary}>
        {readings.length} {readings.length === 1 ? "reading" : "readings"} ·{" "}
        {changes
          .map((entry) => {
            const prefix = changes.length > 1 ? `${entry.label.split(" ")[0].toLowerCase()} ` : "";
            return Math.abs(entry.delta) < Math.pow(10, -decimals) / 2
              ? `${prefix}unchanged`
              : `${prefix}${entry.delta > 0 ? "up" : "down"} ${Math.abs(entry.delta).toFixed(decimals)}`;
          })
          .join(", ")}{" "}
        {definition.unit} since the first
      </Text>

      {series.length > 1 ? (
        <View style={styles.legend}>
          {series.map((s) => (
            <View key={s.label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: s.colour }]} />
              <Text style={styles.legendText}>{s.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: Space.md },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: Space.xs },
  axisSingle: { alignItems: "center", marginTop: Space.xs },
  axisText: { ...Type.caption, color: C.textMuted },
  summary: { ...Type.caption, fontFamily: Font.bodySemi, color: C.text, marginTop: Space.sm },
  legend: { flexDirection: "row", gap: Space.lg, marginTop: Space.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: Space.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...Type.caption, color: C.textMuted },
});

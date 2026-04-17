import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft,  MoreVertical,
  Pause,
  Play,
  Save,
  Scissors,
  StretchHorizontal,
  Copy,
  SlidersHorizontal,
  Trash2,
  Plus,
  Rows3,
  Undo2,
} from "lucide-react";
import { getReceptorPath, getSpritePath, PREVIEW_HITSOUND_URL, type TempSpriteKind } from "@/config/assets";

type Cell = "." | "X" | "M" | "H" | "W";
type ClipboardCell = Cell | "*";
type Mode = "note" | "long" | "select";
type ZoomLevel = 1 | 2 | 4 | 8;
type DelayUnit = "ms" | "beat";
type ViewMode = "editor" | "preview";
type AppSection = "workspace" | "file";
type SelectTool = "row_single" | "range";

type Division = {
  id: string;
  bpm: number;
  delay: number;
  beat: number;
  split: number;
  rows: Cell[][];
};

type RowSelection = {
  divIdx: number;
  rowIdx: number;
};

type LongStart = {
  divIdx: number;
  rowIdx: number;
  colIdx: number;
};

type ClipboardData = {
  rows: ClipboardCell[][];
  rowCount: number;
  effectiveColCount: number;
};

type PropertyDraft = {
  bpm: string;
  delay: string;
  beat: string;
  split: string;
};

type AdjustSplitDraft = {
  nextSplit: string;
};

type AdjustPrimitive =
  | { type: "single"; rowIdx: number; colIdx: number }
  | { type: "long"; startRowIdx: number; endRowIdx: number; colIdx: number }
  | { type: "partial_start"; rowIdx: number; colIdx: number }
  | { type: "partial_end"; rowIdx: number; colIdx: number };

type HiddenMarker = {
  hasM: boolean;
  hasW: boolean;
};

type DisplayActualRow = {
  kind: "actual";
  displayKey: string;
  divIdx: number;
  rowIdx: number;
  cells: Cell[];
  label: string;
  isMeasureStart: boolean;
  isRepresentative: boolean;
  isExpandedHidden: boolean;
  isOpen: boolean;
  hiddenCount: number;
  hiddenMarkers?: HiddenMarker[];
  groupKey?: string;
  startTimeMs: number;
  endTimeMs: number;
  anchorTimeMs: number;
  shortDivisionBeatLabel?: string;
  shortDivisionCue?: boolean;
};

type DisplayGhostRow = {
  kind: "ghost";
  displayKey: string;
  divIdx: number;
  cells: Cell[];
  isMeasureStart: boolean;
  ghostType: "interpolation" | "boundary";
  label: string;
  startTimeMs: number;
  endTimeMs: number;
  anchorTimeMs: number;
};

type DisplayRow = DisplayActualRow | DisplayGhostRow;

type CellRangeSegment = {
  divIdx: number;
  rowStart: number;
  rowEnd: number;
};

type CellRangeSelection = {
  rowStartRef: RowSelection;
  rowEndRef: RowSelection;
  colStart: number;
  colEnd: number;
  segments: CellRangeSegment[];
  totalRowCount: number;
};

type RangeAnchor =
  | { kind: "row"; divIdx: number; rowIdx: number }
  | { kind: "cell"; divIdx: number; rowIdx: number; colIdx: number };

type EditorSnapshot = {
  divisions: Division[];
  selectedDivisionIdx: number;
  selectedRow: RowSelection | null;
  multiSelectedRows: RowSelection[];
  selectedCellRange: CellRangeSelection | null;
  rangeAnchor: RangeAnchor | null;
  pendingLongStart: LongStart | null;
  isTemporaryLongStart: boolean;
  manualExpandedGroups: string[];
  mode: Mode;
  selectTool: SelectTool;
};

type ActiveLaneCell = {
  colIdx: number;
  cell: Exclude<Cell, ".">;
};

type PreviewRowEvent = {
  divIdx: number;
  rowIdx: number;
  cells: Cell[];
  startTimeMs: number;
  endTimeMs: number;
  anchorTimeMs: number;
  rowDurationMs: number;
  beatValue: number;
  scrollBeatValue: number;
  hasNote: boolean;
  hasHitsound: boolean;
  laneCells: ActiveLaneCell[];
};

type PreviewTapEvent = {
  kind: "tap";
  divIdx: number;
  rowIdx: number;
  colIdx: number;
  timeMs: number;
  scrollBeatValue: number;
};

type PreviewHoldEvent = {
  kind: "hold";
  colIdx: number;
  startDivIdx: number;
  startRowIdx: number;
  endDivIdx: number;
  endRowIdx: number;
  startTimeMs: number;
  endTimeMs: number;
  startScrollBeat: number;
  endScrollBeat: number;
};

type PreviewDivisionSpan = {
  divIdx: number;
  timeStartMs: number;
  firstRowStartTimeMs: number;
  timeEndMs: number;
  beatStart: number;
  beatEnd: number;
  scrollBeatStart: number;
  firstRowScrollBeat: number;
  scrollBeatEnd: number;
  delayBeats: number;
  msPerBeat: number;
  rowDurationMs: number;
};

type PreviewTimingData = {
  rowEvents: PreviewRowEvent[];
  rowTimeMap: Record<string, PreviewRowEvent>;
  tapEvents: PreviewTapEvent[];
  holdEvents: PreviewHoldEvent[];
  divisionSpans: PreviewDivisionSpan[];
  chartStartTimeMs: number;
  chartEndTimeMs: number;
  chartStartScrollBeat: number;
  chartEndScrollBeat: number;
};

type EditorSyncTarget = {
  divIdx: number;
  rowIdx: number;
  timeMs: number;
};

type PreviewLongValidationIssue = {
  divIdx: number;
  rowIdx: number;
  colIdx: number;
  message: string;
};

type PreviewLongValidationResult = {
  isValid: boolean;
  issues: PreviewLongValidationIssue[];
};

type PersistedAudioMeta = {
  mode: "none" | "file";
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  durationMs: number | null;
};

type PersistedUiState = {
  appSection: AppSection;
  currentView: ViewMode;
  selectedDivisionIdx: number;
  selectedRow: RowSelection | null;
  previewAnchorTimeMs: number;
  previewZoom: number;
  previewHitsoundVolume: number;
  previewInfoPanelOpen: boolean;
};

type RecentProjectSnapshot = {
  version: 1;
  projectId: string;
  updatedAt: number;
  exportFileNameInput: string;
  divisions: Division[];
  ui: PersistedUiState;
  audio: PersistedAudioMeta;
};

const CELL_LABELS = ["↙", "↖", "□", "↗", "↘"] as const;
const ZOOM_LEVELS: ZoomLevel[] = [1, 2, 4, 8];
const ROW_LABEL_WIDTH = "w-20";
const PREVIEW_VIEWPORT_HEIGHT = 560;
const PREVIEW_JUDGE_LINE_RATIO = 0.18;
const EDITOR_JUDGE_LINE_RATIO = 0.09;
const PREVIEW_BASE_NOTE_SIZE = 62;
const PREVIEW_MIN_NOTE_SIZE = 48;
const PREVIEW_BASE_LANE_INWARD_OFFSETS = [24, 12, 0, -12, -24] as const;
const PREVIEW_START_PADDING_MS = 0;
const PREVIEW_END_PADDING_MS = 0;
const PREVIEW_BEAT_PULSE_WINDOW_MS = 90;
const TEMP_LONG_PRESS_MS = 320;
const TEMP_LONG_MOVE_TOLERANCE = 12;
const ROW_LONG_PRESS_MS = 340;
const ROW_LONG_MOVE_TOLERANCE = 10;
const EDITOR_SCROLL_TOP_PADDING = 84;
const EDITOR_SCROLL_BOTTOM_PADDING = PREVIEW_VIEWPORT_HEIGHT * (1 - EDITOR_JUDGE_LINE_RATIO) + 48;
const ALLOW_REMOTE_PREVIEW_AUDIO = false;
const MAX_UCS_IMPORT_BYTES = Math.floor(1.5 * 1024 * 1024);
const MAX_PREVIEW_AUDIO_DURATION_MS = 20 * 60 * 1000;
const MAX_PREVIEW_AUDIO_BYTES = 300 * 1024 * 1024;
const ALLOWED_PREVIEW_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
]);
const ALLOWED_PREVIEW_AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a", ".webm"] as const;
const RECENT_PROJECT_SCHEMA_VERSION = 1 as const;
const RECENT_PROJECT_ID = "autosave-recent";
const RECENT_PROJECT_DB_NAME = "ucs-mobile-alpha-db";
const RECENT_PROJECT_STORE_NAME = "recent-projects";
const RECENT_PROJECT_LAST_ID_KEY = "ucs-mobile-alpha:last-project-id";
const RECENT_PROJECT_AUTOSAVE_DELAY_MS = 1000;

const parseRows = (rows: string[]): Cell[][] => rows.map((r) => r.split("") as Cell[]);

const initialDivisions: Division[] = [
  {
    id: "div-1",
    bpm: 120,
    delay: 0,
    beat: 4,
    split: 4,
    rows: parseRows([
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ]),
  },
];

const cloneDivisions = (divisions: Division[]) =>
  divisions.map((div) => ({ ...div, rows: div.rows.map((row) => [...row] as Cell[]) }));

const emptyRow = (): Cell[] => [".", ".", ".", ".", "."];

function roundToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isIntegerLike(value: number): boolean {
  return Number.isInteger(value);
}

function formatRounded(value: number, decimals: number): string {
  return String(roundToDecimals(value, decimals));
}

function formatPreviewTimeMs(value: number): string {
  return value.toFixed(3);
}

function formatBeatLengthLabel(rowCount: number, split: number): string {
  return `${rowCount}/${split}b`;
}

function normalizePreviewZoom(value: number): number {
  return Math.min(8, Math.max(1, roundToDecimals(value, 1)));
}

function normalizeHitsoundVolume(value: number): number {
  if (!Number.isFinite(value)) return 0.7;
  return Math.min(1, Math.max(0, roundToDecimals(value, 2)));
}

function getMsPerBeat(bpm: number): number {
  return 60000 / bpm;
}

function convertDelayValue(value: number, fromUnit: DelayUnit, toUnit: DelayUnit, bpm: number): number {
  if (fromUnit === toUnit || !Number.isFinite(value) || !Number.isFinite(bpm) || bpm <= 0) {
    return value;
  }
  const msPerBeat = getMsPerBeat(bpm);
  return fromUnit === "ms" ? value / msPerBeat : value * msPerBeat;
}


function buildHiddenMarkers(rows: Cell[][], hiddenRows: number[]): HiddenMarker[] {
  return CELL_LABELS.map((_, colIdx) => ({
    hasM: hiddenRows.some((rowIdx) => rows[rowIdx]?.[colIdx] === "M"),
    hasW: hiddenRows.some((rowIdx) => rows[rowIdx]?.[colIdx] === "W"),
  }));
}

function actualRowLabel(divisions: Division[], divIdx: number, rowIdx: number): string {
  const div = divisions[divIdx];
  const rowsPerMeasure = div.beat * div.split;
  const measure = Math.floor(rowIdx / rowsPerMeasure) + 1;
  const rowInMeasure = (rowIdx % rowsPerMeasure) + 1;
  return `${divIdx + 1}.${measure}.${rowInMeasure}`;
}

function usesBoundaryGhost(div: Division, zoomLevel: ZoomLevel): boolean {
  return zoomLevel > 1 && div.split !== zoomLevel && div.split % zoomLevel !== 0 && zoomLevel % div.split !== 0;
}

function formatFractionLabel(numerator: number, denominator: number): string {
  const key = `${numerator}/${denominator}`;
  const map: Record<string, string> = {
    "1/2": "½",
    "1/4": "¼",
    "3/4": "¾",
    "1/8": "⅛",
    "3/8": "⅜",
    "5/8": "⅝",
    "7/8": "⅞",
  };
  return map[key] ?? `${numerator}/${denominator}`;
}

function buildBoundaryGhostCells(
  rows: Cell[][],
  beatStart: number,
  beatLength: number,
  boundaryIndex: number,
  zoomLevel: ZoomLevel,
): Cell[] {
  const boundary = boundaryIndex / zoomLevel;
  const scaled = boundary * beatLength;
  const leftOffset = Math.max(0, Math.min(beatLength - 1, Math.ceil(scaled) - 1));
  const rightOffset = Math.max(0, Math.min(beatLength - 1, Math.ceil(scaled)));

  return CELL_LABELS.map((_, colIdx) => {
    const left = rows[beatStart + leftOffset]?.[colIdx] ?? ".";
    const right = rows[beatStart + rightOffset]?.[colIdx] ?? ".";
    const crossesBoundary = (left === "M" || left === "H") && (right === "H" || right === "W");
    return crossesBoundary ? "H" : ".";
  }) as Cell[];
}

function getVisibleBoundaryIndices(split: number, beatLength: number, zoomLevel: ZoomLevel): number[] {
  if (zoomLevel <= 1) return [];
  const all = Array.from({ length: zoomLevel - 1 }, (_, index) => index + 1);
  if (beatLength >= split) return all;
  if (beatLength <= 1) return [];
  const lastActualStart = (beatLength - 1) / split;
  return all.filter((boundaryIndex) => boundaryIndex / zoomLevel <= lastActualStart + 1e-9);
}

function getGroupInfo(div: Division, rowIdx: number, zoomLevel: ZoomLevel) {
  const beatStart = rowIdx - (rowIdx % div.split);
  const beatLength = Math.min(div.split, div.rows.length - beatStart);

  if (usesBoundaryGhost(div, zoomLevel)) {
    const rows = Array.from({ length: beatLength }, (_, index) => beatStart + index);
    return {
      groupKey: `${div.id}:${beatStart}:boundary:z${zoomLevel}`,
      rows,
      representativeRowIdx: beatStart,
      isHidden: rowIdx !== beatStart,
    };
  }

  if (zoomLevel >= div.split) return null;

  const offsetInBeat = rowIdx - beatStart;
  const groupIndex = Math.floor((offsetInBeat * zoomLevel) / div.split);
  const rows: number[] = [];
  for (let offset = 0; offset < beatLength; offset += 1) {
    if (Math.floor((offset * zoomLevel) / div.split) === groupIndex) {
      rows.push(beatStart + offset);
    }
  }
  if (rows.length === 0) return null;
  return {
    groupKey: `${div.id}:${beatStart}:${groupIndex}:z${zoomLevel}`,
    rows,
    representativeRowIdx: rows[0],
    isHidden: rows.length > 1 && rowIdx !== rows[0],
  };
}

function deleteConnectedAt(divisions: Division[], divIdx: number, rowIdx: number, colIdx: number): Division[] {
  const next = cloneDivisions(divisions);
  const rows = next[divIdx].rows;
  const value = rows[rowIdx]?.[colIdx];
  if (!value || value === ".") return next;

  const clear = (r: number) => {
    if (rows[r] && rows[r][colIdx] !== undefined) rows[r][colIdx] = ".";
  };

  if (value === "X") {
    clear(rowIdx);
    return next;
  }

  if (value === "M") {
    clear(rowIdx);
    let r = rowIdx + 1;
    while (r < rows.length && rows[r][colIdx] === "H") {
      clear(r);
      r += 1;
    }
    if (r < rows.length && rows[r][colIdx] === "W") clear(r);
    return next;
  }

  if (value === "W") {
    clear(rowIdx);
    let r = rowIdx - 1;
    while (r >= 0 && rows[r][colIdx] === "H") {
      clear(r);
      r -= 1;
    }
    if (r >= 0 && rows[r][colIdx] === "M") clear(r);
    return next;
  }

  let top = rowIdx;
  let bottom = rowIdx;
  while (top - 1 >= 0 && rows[top - 1][colIdx] === "H") top -= 1;
  while (bottom + 1 < rows.length && rows[bottom + 1][colIdx] === "H") bottom += 1;
  for (let r = top; r <= bottom; r += 1) clear(r);
  if (top - 1 >= 0 && rows[top - 1][colIdx] === "M") clear(top - 1);
  if (bottom + 1 < rows.length && rows[bottom + 1][colIdx] === "W") clear(bottom + 1);
  return next;
}

function getConnectedRange(rows: Cell[][], rowIdx: number, colIdx: number) {
  const value = rows[rowIdx]?.[colIdx];
  if (!value || value === ".") return null;

  if (value === "X") return { top: rowIdx, bottom: rowIdx, isLong: false };

  if (value === "M") {
    let bottom = rowIdx;
    let cursor = rowIdx + 1;
    while (cursor < rows.length && rows[cursor][colIdx] === "H") {
      bottom = cursor;
      cursor += 1;
    }
    if (cursor < rows.length && rows[cursor][colIdx] === "W") bottom = cursor;
    return { top: rowIdx, bottom, isLong: true };
  }

  if (value === "W") {
    let top = rowIdx;
    let cursor = rowIdx - 1;
    while (cursor >= 0 && rows[cursor][colIdx] === "H") {
      top = cursor;
      cursor -= 1;
    }
    if (cursor >= 0 && rows[cursor][colIdx] === "M") top = cursor;
    return { top, bottom: rowIdx, isLong: true };
  }

  let top = rowIdx;
  let bottom = rowIdx;
  while (top - 1 >= 0 && rows[top - 1][colIdx] === "H") top -= 1;
  while (bottom + 1 < rows.length && rows[bottom + 1][colIdx] === "H") bottom += 1;
  if (top - 1 >= 0 && rows[top - 1][colIdx] === "M") top -= 1;
  if (bottom + 1 < rows.length && rows[bottom + 1][colIdx] === "W") bottom += 1;
  return { top, bottom, isLong: true };
}

function buildFlatRowRefs(divisions: Division[]) {
  return divisions.flatMap((div, divIdx) => div.rows.map((_, rowIdx) => ({ divIdx, rowIdx })));
}

function getFlatRowIndex(divisions: Division[], target: RowSelection): number {
  const flatRefs = buildFlatRowRefs(divisions);
  return flatRefs.findIndex((row) => row.divIdx === target.divIdx && row.rowIdx === target.rowIdx);
}

function getRowSelectionsInRange(divisions: Division[], start: RowSelection, end: RowSelection): RowSelection[] {
  const flatRefs = buildFlatRowRefs(divisions);
  const startIndex = flatRefs.findIndex((row) => row.divIdx === start.divIdx && row.rowIdx === start.rowIdx);
  const endIndex = flatRefs.findIndex((row) => row.divIdx === end.divIdx && row.rowIdx === end.rowIdx);
  if (startIndex < 0 || endIndex < 0) return [];
  const from = Math.min(startIndex, endIndex);
  const to = Math.max(startIndex, endIndex);
  return flatRefs.slice(from, to + 1);
}

function buildCellRangeSelection(divisions: Division[], anchor: RangeAnchor & { kind: "cell" }, focus: RangeAnchor & { kind: "cell" }): CellRangeSelection {
  const rowSelections = getRowSelectionsInRange(
    divisions,
    { divIdx: anchor.divIdx, rowIdx: anchor.rowIdx },
    { divIdx: focus.divIdx, rowIdx: focus.rowIdx },
  );
  const colStart = Math.min(anchor.colIdx, focus.colIdx);
  const colEnd = Math.max(anchor.colIdx, focus.colIdx);
  const segments: CellRangeSegment[] = [];

  rowSelections.forEach((row) => {
    const last = segments[segments.length - 1];
    if (!last || last.divIdx !== row.divIdx || last.rowEnd + 1 !== row.rowIdx) {
      segments.push({ divIdx: row.divIdx, rowStart: row.rowIdx, rowEnd: row.rowIdx });
      return;
    }
    last.rowEnd = row.rowIdx;
  });

  const [rowStartRef, rowEndRef] = (() => {
    const anchorIndex = getFlatRowIndex(divisions, { divIdx: anchor.divIdx, rowIdx: anchor.rowIdx });
    const focusIndex = getFlatRowIndex(divisions, { divIdx: focus.divIdx, rowIdx: focus.rowIdx });
    return anchorIndex <= focusIndex
      ? [{ divIdx: anchor.divIdx, rowIdx: anchor.rowIdx }, { divIdx: focus.divIdx, rowIdx: focus.rowIdx }]
      : [{ divIdx: focus.divIdx, rowIdx: focus.rowIdx }, { divIdx: anchor.divIdx, rowIdx: anchor.rowIdx }];
  })();

  return {
    rowStartRef,
    rowEndRef,
    colStart,
    colEnd,
    segments,
    totalRowCount: rowSelections.length,
  };
}

function getSelectedCellRangeRows(selection: CellRangeSelection): RowSelection[] {
  const rows: RowSelection[] = [];
  selection.segments.forEach((segment) => {
    for (let rowIdx = segment.rowStart; rowIdx <= segment.rowEnd; rowIdx += 1) {
      rows.push({ divIdx: segment.divIdx, rowIdx });
    }
  });
  return rows;
}

function validatePreviewLongNotes(divisions: Division[]): PreviewLongValidationResult {
  const flatRefs = buildFlatRowRefs(divisions);
  const issues: PreviewLongValidationIssue[] = [];

  for (let colIdx = 0; colIdx < CELL_LABELS.length; colIdx += 1) {
    let openStart: { divIdx: number; rowIdx: number } | null = null;

    for (let flatIdx = 0; flatIdx < flatRefs.length; flatIdx += 1) {
      const { divIdx, rowIdx } = flatRefs[flatIdx];
      const cell = divisions[divIdx].rows[rowIdx][colIdx];

      if (!openStart) {
        if (cell === "M") {
          openStart = { divIdx, rowIdx };
          continue;
        }
        if (cell === "H") {
          issues.push({
            divIdx,
            rowIdx,
            colIdx,
            message: "위쪽에 대응하는 롱노트 시작(M)이 없습니다.",
          });
          continue;
        }
        if (cell === "W") {
          issues.push({
            divIdx,
            rowIdx,
            colIdx,
            message: "위쪽에 대응하는 롱노트 시작(M)이 없습니다.",
          });
        }
        continue;
      }

      if (cell === "H") continue;

      if (cell === "W") {
        openStart = null;
        continue;
      }

      if (cell === "M") {
        issues.push({
          divIdx: openStart.divIdx,
          rowIdx: openStart.rowIdx,
          colIdx,
          message: "아래쪽에 대응하는 롱노트 끝(W)이 없습니다.",
        });
        openStart = { divIdx, rowIdx };
        continue;
      }

      issues.push({
        divIdx: openStart.divIdx,
        rowIdx: openStart.rowIdx,
        colIdx,
        message: "롱노트가 중간에서 끊겨 있습니다.",
      });
      openStart = null;
    }

    if (openStart) {
      issues.push({
        divIdx: openStart.divIdx,
        rowIdx: openStart.rowIdx,
        colIdx,
        message: "아래쪽에 대응하는 롱노트 끝(W)이 없습니다.",
      });
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

function refKey(divIdx: number, rowIdx: number): string {
  return `${divIdx}:${rowIdx}`;
}

function placeLongWithOverwrite(
  divisions: Division[],
  startRef: { divIdx: number; rowIdx: number },
  endRef: { divIdx: number; rowIdx: number },
  colIdx: number,
) {
  const next = cloneDivisions(divisions);
  const flatRefs = buildFlatRowRefs(divisions);
  const flatIndexMap = new Map(flatRefs.map((ref, index) => [refKey(ref.divIdx, ref.rowIdx), index]));

  const startFlat = flatIndexMap.get(refKey(startRef.divIdx, startRef.rowIdx));
  const endFlat = flatIndexMap.get(refKey(endRef.divIdx, endRef.rowIdx));
  if (startFlat === undefined || endFlat === undefined || startFlat === endFlat) {
    return { next, overwritten: false };
  }

  const [from, to] = startFlat <= endFlat ? [startFlat, endFlat] : [endFlat, startFlat];
  const overlappedLongRanges: Array<{ divIdx: number; top: number; bottom: number }> = [];
  const seenLongRanges = new Set<string>();
  let overwritten = false;

  for (let i = from; i <= to; i += 1) {
    const { divIdx, rowIdx } = flatRefs[i];
    const originalValue = divisions[divIdx].rows[rowIdx][colIdx];
    if (originalValue !== ".") overwritten = true;
    if (originalValue === "M" || originalValue === "H" || originalValue === "W") {
      const range = getConnectedRange(divisions[divIdx].rows, rowIdx, colIdx);
      if (range && range.isLong) {
        const key = `${divIdx}:${range.top}:${range.bottom}`;
        if (!seenLongRanges.has(key)) {
          seenLongRanges.add(key);
          overlappedLongRanges.push({ divIdx, top: range.top, bottom: range.bottom });
        }
      }
    }
  }

  for (let i = from; i <= to; i += 1) {
    const { divIdx, rowIdx } = flatRefs[i];
    next[divIdx].rows[rowIdx][colIdx] = i === from ? "M" : i === to ? "W" : "H";
  }

  for (const range of overlappedLongRanges) {
    for (let rowIdx = range.top; rowIdx <= range.bottom; rowIdx += 1) {
      const flatIndex = flatIndexMap.get(refKey(range.divIdx, rowIdx));
      if (flatIndex === undefined) continue;
      if (flatIndex < from || flatIndex > to) {
        next[range.divIdx].rows[rowIdx][colIdx] = ".";
      }
    }
  }

  return { next, overwritten };
}

function stripUcsExtension(fileName: string): string {
  return fileName.replace(/\.ucs$/i, "");
}

function sanitizeUcsFileNameInput(raw: string): string {
  const cleaned = raw.replace(/[\/:*?"<>|]/g, "_").trim();
  return cleaned;
}

function buildUcsFileName(raw: string): string {
  const cleaned = sanitizeUcsFileNameInput(stripUcsExtension(raw));
  const base = cleaned || "untitled";
  return `${base}.ucs`;
}

function getTextByteLength(value: string): number {
  return new Blob([value]).size;
}

function formatImportSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

function formatDurationLabel(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}분` : `${minutes}분 ${seconds}초`;
}

function isAllowedPreviewAudioFile(file: File): boolean {
  const normalizedType = file.type.trim().toLowerCase();
  if (normalizedType && ALLOWED_PREVIEW_AUDIO_MIME_TYPES.has(normalizedType)) {
    return true;
  }

  const lowerName = file.name.trim().toLowerCase();
  return ALLOWED_PREVIEW_AUDIO_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function serialize(divisions: Division[]): string {
  const header = [":Format=1", ":Mode=Single"];
  const body = divisions.flatMap((div) => [
    `:BPM=${div.bpm}`,
    `:Delay=${div.delay}`,
    `:Beat=${div.beat}`,
    `:Split=${div.split}`,
    ...div.rows.map((row) => row.join("")),
  ]);
  return [...header, ...body].join(String.fromCharCode(10));
}

function formatUcsLinePreview(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "(빈 줄)";
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
}

function createUcsImportError(message: string, options?: { lineNumber?: number; line?: string }): Error {
  if (!options?.lineNumber) return new Error(message);
  const linePreview = options.line !== undefined ? ` · 입력값: "${formatUcsLinePreview(options.line)}"` : "";
  return new Error(`${options.lineNumber}행 · ${message}${linePreview}`);
}

function getUcsImportHint(rawMessage: string): string | null {
  if (rawMessage.includes(":Format=1")) return "파일 맨 위에 :Format=1 이 있는지 확인하세요.";
  if (rawMessage.includes(":Mode=Single")) return "파일 맨 위에 :Mode=Single 이 있는지 확인하세요.";
  if (rawMessage.includes("노트 행은 정확히 5글자")) return "각 노트 행은 5칸(↙ ↖ □ ↗ ↘)에 대응하므로 정확히 5글자여야 합니다.";
  if (rawMessage.includes("허용되지 않는 노트 문자")) return "사용 가능한 문자는 . X M H W 입니다.";
  if (rawMessage.includes("BPM 값이 올바르지 않습니다")) return "BPM은 0보다 큰 숫자로 입력해야 합니다.";
  if (rawMessage.includes("Delay 값이 올바르지 않습니다")) return "Delay는 숫자로 입력해야 합니다. 저장 단위는 ms입니다.";
  if (rawMessage.includes("Beat 값은 1 이상의 정수")) return "Beat는 1 이상의 정수만 입력할 수 있습니다.";
  if (rawMessage.includes("Split 값은 1 이상의 정수")) return "Split은 1 이상의 정수만 입력할 수 있습니다.";
  if (rawMessage.includes("롱노트 오류:")) return "M 시작, H 유지, W 끝 순서가 끊기지 않는지 확인하세요.";
  if (rawMessage.includes("Division에 노트 행이 하나도 없습니다")) return "각 Division에는 최소 1개의 노트 행이 있어야 합니다.";
  return null;
}

function formatUcsImportErrorMessage(error: unknown, sourceLabel: string): string {
  const LF = String.fromCharCode(10);
  const subject = sourceLabel === "텍스트" ? "텍스트 가져오기 실패" : `파일 가져오기 실패 · ${sourceLabel}`;

  if (!(error instanceof Error)) {
    return [subject, "알 수 없는 오류가 발생했습니다."].join(LF);
  }

  const raw = error.message.trim();
  if (!raw) {
    return [subject, "오류 메시지가 비어 있습니다."].join(LF);
  }

  let normalized = raw;
  if (normalized.startsWith("헤더 오류:")) {
    normalized = normalized.replace("헤더 오류:", "헤더 오류 ·");
  } else if (normalized.startsWith("롱노트 오류:")) {
    normalized = normalized.replace("롱노트 오류:", "롱노트 구조 오류 ·");
  }

  const hint = getUcsImportHint(raw);
  return hint ? [subject, normalized, `확인 사항 · ${hint}`].join(LF) : [subject, normalized].join(LF);
}

function parseUcsText(text: string): Division[] {
  const textBytes = getTextByteLength(text);
  if (textBytes > MAX_UCS_IMPORT_BYTES) {
    throw createUcsImportError(`UCS 데이터 크기는 최대 ${formatImportSize(MAX_UCS_IMPORT_BYTES)}까지만 가져올 수 있습니다. 현재 ${formatImportSize(textBytes)}입니다.`);
  }
  const CR = String.fromCharCode(13);
  const LF = String.fromCharCode(10);
  const CRLF = CR + LF;
  const normalized = text.split(CRLF).join(LF).split(CR).join(LF);
  const lines = normalized.split(LF);
  const divisions: Division[] = [];
  let formatSeen = false;
  let modeSeen = false;
  let currentBpm: number | null = null;
  let currentDelay: number | null = null;
  let currentBeat: number | null = null;
  let currentSplit: number | null = null;
  let currentRows: Cell[][] = [];

  const resetDivisionDraft = () => {
    currentBpm = null;
    currentDelay = null;
    currentBeat = null;
    currentSplit = null;
    currentRows = [];
  };

  const flushDivision = (lineNumber: number) => {
    if (currentBpm === null && currentDelay === null && currentBeat === null && currentSplit === null && currentRows.length === 0) {
      return;
    }
    if (currentBpm === null || currentDelay === null || currentBeat === null || currentSplit === null) {
      throw createUcsImportError("Division 속성(BPM / Delay / Beat / Split)이 완전하지 않습니다.", { lineNumber });
    }
    if (currentRows.length === 0) {
      throw createUcsImportError("Division에 노트 행이 하나도 없습니다.", { lineNumber });
    }
    divisions.push({
      id: `import-div-${divisions.length + 1}`,
      bpm: currentBpm,
      delay: currentDelay,
      beat: currentBeat,
      split: currentSplit,
      rows: currentRows.map((row) => [...row] as Cell[]),
    });
    resetDivisionDraft();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index].trim();
    if (!line) continue;

    if (line.startsWith(":Format=")) {
      const value = line.slice(8).trim();
      if (value !== "1") throw createUcsImportError("Format은 1만 지원합니다.", { lineNumber, line });
      formatSeen = true;
      continue;
    }

    if (line.startsWith(":Mode=")) {
      const value = line.slice(6).trim();
      if (value !== "Single") throw createUcsImportError("Mode는 Single만 지원합니다.", { lineNumber, line });
      modeSeen = true;
      continue;
    }

    if (line.startsWith(":BPM=")) {
      if (currentRows.length > 0) flushDivision(lineNumber);
      const value = Number(line.slice(5).trim());
      if (!Number.isFinite(value) || value <= 0) throw createUcsImportError("BPM 값이 올바르지 않습니다.", { lineNumber, line });
      currentBpm = value;
      continue;
    }

    if (line.startsWith(":Delay=")) {
      if (currentRows.length > 0) flushDivision(lineNumber);
      const value = Number(line.slice(7).trim());
      if (!Number.isFinite(value)) throw createUcsImportError("Delay 값이 올바르지 않습니다.", { lineNumber, line });
      currentDelay = value;
      continue;
    }

    if (line.startsWith(":Beat=")) {
      if (currentRows.length > 0) flushDivision(lineNumber);
      const value = Number(line.slice(6).trim());
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
        throw createUcsImportError("Beat 값은 1 이상의 정수여야 합니다.", { lineNumber, line });
      }
      currentBeat = value;
      continue;
    }

    if (line.startsWith(":Split=")) {
      if (currentRows.length > 0) flushDivision(lineNumber);
      const value = Number(line.slice(7).trim());
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
        throw createUcsImportError("Split 값은 1 이상의 정수여야 합니다.", { lineNumber, line });
      }
      currentSplit = value;
      continue;
    }

    if (currentBpm === null || currentDelay === null || currentBeat === null || currentSplit === null) {
      throw createUcsImportError("노트 행보다 먼저 BPM / Delay / Beat / Split이 모두 선언되어야 합니다.", { lineNumber, line });
    }
    if (line.length !== 5) {
      throw createUcsImportError("노트 행은 정확히 5글자여야 합니다.", { lineNumber, line });
    }
    if (!/^[.XMHW]{5}$/.test(line)) {
      throw createUcsImportError("허용되지 않는 노트 문자가 있습니다. 사용 가능: . X M H W", { lineNumber, line });
    }
    currentRows.push(line.split("") as Cell[]);
  }

  flushDivision(lines.length);

  if (!formatSeen) throw createUcsImportError("헤더 오류: :Format=1 이 없습니다.");
  if (!modeSeen) throw createUcsImportError("헤더 오류: :Mode=Single 이 없습니다.");
  if (divisions.length === 0) throw createUcsImportError("불러올 Division이 없습니다. 헤더 아래에 Division 데이터를 넣어 주세요.");

  const validation = validatePreviewLongNotes(divisions);
  if (!validation.isValid) {
    const firstIssue = validation.issues[0];
    throw createUcsImportError(`롱노트 오류: ${actualRowLabel(divisions, firstIssue.divIdx, firstIssue.rowIdx)} ${CELL_LABELS[firstIssue.colIdx]}열 ${firstIssue.message}`);
  }

  return divisions;
}

function runUcsParserSelfChecks() {
  const CR = String.fromCharCode(13);
  const LF = String.fromCharCode(10);
  const CRLF = CR + LF;
  const sampleLines = [
    ":Format=1",
    ":Mode=Single",
    ":BPM=120",
    ":Delay=0",
    ":Beat=4",
    ":Split=2",
    ".....",
    "X....",
  ];

  const parsedLf = parseUcsText(sampleLines.join(LF));
  if (parsedLf.length !== 1) throw new Error("UCS parser self-check failed: LF division count mismatch.");
  if (parsedLf[0].rows.length !== 2) throw new Error("UCS parser self-check failed: LF row count mismatch.");
  if (parsedLf[0].rows[1][0] !== "X") throw new Error("UCS parser self-check failed: LF cell value mismatch.");

  const parsedCrlf = parseUcsText(sampleLines.join(CRLF));
  if (parsedCrlf.length !== 1) throw new Error("UCS parser self-check failed: CRLF division count mismatch.");
  if (parsedCrlf[0].rows.length !== 2) throw new Error("UCS parser self-check failed: CRLF row count mismatch.");

  let invalidRowFailed = false;
  try {
    parseUcsText(sampleLines.concat(["TOOLONG"]).join(LF));
  } catch (error) {
    invalidRowFailed =
      error instanceof Error && error.message.includes("9행") && error.message.includes("TOOLONG");
  }
  if (!invalidRowFailed) throw new Error("UCS parser self-check failed: invalid row should throw with line preview.");

  const formattedInvalidRowMessage = formatUcsImportErrorMessage(
    createUcsImportError("노트 행은 정확히 5글자여야 합니다.", { lineNumber: 9, line: "TOOLONG" }),
    "텍스트",
  );
  if (!formattedInvalidRowMessage.includes("각 노트 행은 5칸")) {
    throw new Error("UCS parser self-check failed: invalid row hint should be readable.");
  }

  let missingHeaderFailed = false;
  try {
    parseUcsText(sampleLines.slice(1).join(LF));
  } catch (error) {
    missingHeaderFailed = error instanceof Error && error.message.includes(":Format=1");
  }
  if (!missingHeaderFailed) throw new Error("UCS parser self-check failed: missing header should throw a readable message.");

  const formattedHeaderMessage = formatUcsImportErrorMessage(createUcsImportError("헤더 오류: :Format=1 이 없습니다."), "텍스트");
  if (!formattedHeaderMessage.includes("파일 맨 위에 :Format=1")) {
    throw new Error("UCS parser self-check failed: header hint should be readable.");
  }
}

const isDevRuntime = ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV ?? false) === true;

if (isDevRuntime) {
  runUcsParserSelfChecks();
}

function setRecentProjectLastId(projectId: string) {
  try {
    window.localStorage.setItem(RECENT_PROJECT_LAST_ID_KEY, projectId);
  } catch {
    // noop
  }
}

function getRecentProjectLastId(): string | null {
  try {
    return window.localStorage.getItem(RECENT_PROJECT_LAST_ID_KEY);
  } catch {
    return null;
  }
}

function openRecentProjectDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB를 사용할 수 없습니다."));
      return;
    }

    const request = window.indexedDB.open(RECENT_PROJECT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECENT_PROJECT_STORE_NAME)) {
        db.createObjectStore(RECENT_PROJECT_STORE_NAME, { keyPath: "projectId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("최근 작업 DB를 열지 못했습니다."));
  });
}

async function saveRecentProjectSnapshot(snapshot: RecentProjectSnapshot): Promise<void> {
  const db = await openRecentProjectDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(RECENT_PROJECT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(RECENT_PROJECT_STORE_NAME);
    store.put(snapshot);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("최근 작업 저장에 실패했습니다."));
    transaction.onabort = () => reject(transaction.error ?? new Error("최근 작업 저장이 중단되었습니다."));
  });
  db.close();
  setRecentProjectLastId(snapshot.projectId);
}

async function loadRecentProjectSnapshot(): Promise<RecentProjectSnapshot | null> {
  const projectId = getRecentProjectLastId() ?? RECENT_PROJECT_ID;
  const db = await openRecentProjectDb();
  const snapshot = await new Promise<RecentProjectSnapshot | null>((resolve, reject) => {
    const transaction = db.transaction(RECENT_PROJECT_STORE_NAME, "readonly");
    const store = transaction.objectStore(RECENT_PROJECT_STORE_NAME);
    const request = store.get(projectId);
    request.onsuccess = () => resolve((request.result as RecentProjectSnapshot | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("최근 작업 불러오기에 실패했습니다."));
  });
  db.close();
  if (!snapshot || snapshot.version !== RECENT_PROJECT_SCHEMA_VERSION) return null;
  return snapshot;
}

function findNearestActualRowByTime(rowEvents: PreviewRowEvent[], timeMs: number): RowSelection | null {
  if (rowEvents.length === 0) return null;

  let nearest = rowEvents[0];
  let nearestDistance = Math.abs(rowEvents[0].anchorTimeMs - timeMs);

  for (let index = 1; index < rowEvents.length; index += 1) {
    const candidate = rowEvents[index];
    const distance = Math.abs(candidate.anchorTimeMs - timeMs);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
      continue;
    }
    if (Math.abs(distance - nearestDistance) < 0.001 && candidate.anchorTimeMs < nearest.anchorTimeMs) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return { divIdx: nearest.divIdx, rowIdx: nearest.rowIdx };
}

function getPreviewScrollBeatByTime(divisionSpans: PreviewDivisionSpan[], timeMs: number): number {
  if (divisionSpans.length === 0) return 0;

  const firstSpan = divisionSpans[0];
  if (timeMs <= firstSpan.timeStartMs) return firstSpan.scrollBeatStart;

  for (let index = 0; index < divisionSpans.length; index += 1) {
    const span = divisionSpans[index];
    const isLast = index === divisionSpans.length - 1;
    if (timeMs < span.timeEndMs || isLast) {
      const clampedTimeMs = Math.min(Math.max(timeMs, span.timeStartMs), span.timeEndMs);
      return span.firstRowScrollBeat + (clampedTimeMs - span.firstRowStartTimeMs) / span.msPerBeat;
    }
  }

  return divisionSpans[divisionSpans.length - 1].scrollBeatEnd;
}

function getPreviewTimeByScrollBeat(divisionSpans: PreviewDivisionSpan[], scrollBeat: number): number {
  if (divisionSpans.length === 0) return 0;

  const firstSpan = divisionSpans[0];
  if (scrollBeat <= firstSpan.scrollBeatStart) return firstSpan.timeStartMs;

  for (let index = 0; index < divisionSpans.length; index += 1) {
    const span = divisionSpans[index];
    const isLast = index === divisionSpans.length - 1;
    if (scrollBeat < span.scrollBeatEnd || isLast) {
      const clampedScrollBeat = Math.min(Math.max(scrollBeat, span.scrollBeatStart), span.scrollBeatEnd);
      return span.firstRowStartTimeMs + (clampedScrollBeat - span.firstRowScrollBeat) * span.msPerBeat;
    }
  }

  return divisionSpans[divisionSpans.length - 1].timeEndMs;
}

function getPreviewBeatPulseStrength(divisionSpans: PreviewDivisionSpan[], timeMs: number, windowMs: number): number {
  if (divisionSpans.length === 0 || windowMs <= 0) return 0;

  for (let index = 0; index < divisionSpans.length; index += 1) {
    const span = divisionSpans[index];
    const isLast = index === divisionSpans.length - 1;
    if (timeMs < span.timeEndMs || isLast) {
      if (timeMs < span.firstRowStartTimeMs) return 0;
      const relativeMs = timeMs - span.firstRowStartTimeMs;
      const beatIndex = Math.round(relativeMs / span.msPerBeat);
      const nearestBeatTimeMs = span.firstRowStartTimeMs + beatIndex * span.msPerBeat;
      const distanceMs = Math.abs(timeMs - nearestBeatTimeMs);
      if (distanceMs > windowMs) return 0;
      const normalized = 1 - distanceMs / windowMs;
      return Math.max(0, roundToDecimals(normalized, 3));
    }
  }

  return 0;
}

function resolveEditorSyncRowByTime(previewTimingData: PreviewTimingData, timeMs: number): RowSelection | null {
  for (const span of previewTimingData.divisionSpans) {
    if (timeMs >= span.timeStartMs && timeMs < span.firstRowStartTimeMs) {
      return { divIdx: span.divIdx, rowIdx: 0 };
    }
  }

  return findNearestActualRowByTime(previewTimingData.rowEvents, timeMs);
}

function findNearestDisplayRowByTime(displayRows: DisplayRow[], timeMs: number): DisplayRow | null {
  if (displayRows.length === 0) return null;

  let nearest = displayRows[0];
  let nearestDistance = Math.abs(displayRows[0].anchorTimeMs - timeMs);

  for (let index = 1; index < displayRows.length; index += 1) {
    const candidate = displayRows[index];
    const distance = Math.abs(candidate.anchorTimeMs - timeMs);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
      continue;
    }
    if (Math.abs(distance - nearestDistance) < 0.001 && candidate.anchorTimeMs < nearest.anchorTimeMs) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function mirrorRowHorizontally(row: Cell[]): Cell[] {
  return [...row].reverse() as Cell[];
}

function mirrorCellRangeHorizontally(row: Cell[], colStart: number, colEnd: number): Cell[] {
  const next = [...row] as Cell[];
  for (let left = colStart, right = colEnd; left < right; left += 1, right -= 1) {
    const temp = next[left];
    next[left] = next[right];
    next[right] = temp;
  }
  return next;
}

function createClipboardRow(): ClipboardCell[] {
  return ["*", "*", "*", "*", "*"];
}

function toClipboardRowsFromSelectedCells(divisions: Division[], selection: CellRangeSelection): ClipboardData {
  const rows: ClipboardCell[][] = [];
  const effectiveColCount = selection.colEnd - selection.colStart + 1;
  selection.segments.forEach((segment) => {
    for (let rowIdx = segment.rowStart; rowIdx <= segment.rowEnd; rowIdx += 1) {
      const clipboardRow = createClipboardRow();
      for (let sourceColIdx = selection.colStart; sourceColIdx <= selection.colEnd; sourceColIdx += 1) {
        clipboardRow[sourceColIdx - selection.colStart] = divisions[segment.divIdx].rows[rowIdx][sourceColIdx];
      }
      rows.push(clipboardRow);
    }
  });
  return {
    rows,
    rowCount: rows.length,
    effectiveColCount,
  };
}

function toClipboardRowsFromSelectedRows(divisions: Division[], targets: RowSelection[]): ClipboardData {
  const rows = targets.map(({ divIdx, rowIdx }) => [...divisions[divIdx].rows[rowIdx]] as ClipboardCell[]);
  return {
    rows,
    rowCount: rows.length,
    effectiveColCount: 5,
  };
}

function buildPreviewTimingData(divisions: Division[]): PreviewTimingData {
  const rowEvents: PreviewRowEvent[] = [];
  const rowTimeMap: Record<string, PreviewRowEvent> = {};
  const divisionSpans: PreviewDivisionSpan[] = [];
  let divisionCursorMs = 0;
  let divisionCursorBeat = 0;
  let cumulativeDelayBeats = 0;

  divisions.forEach((div, divIdx) => {
    const msPerBeat = getMsPerBeat(div.bpm);
    const rowDurationMs = msPerBeat / div.split;
    const delayBeats = div.delay / msPerBeat;
    const beatStart = divisionCursorBeat;
    const beatEnd = beatStart + div.rows.length / div.split;
    const timeStartMs = divisionCursorMs;
    const firstRowStartTimeMs = timeStartMs + div.delay;
    const timeEndMs = firstRowStartTimeMs + div.rows.length * rowDurationMs;
    const scrollBeatStart = beatStart + cumulativeDelayBeats;
    const firstRowScrollBeat = scrollBeatStart + delayBeats;
    const scrollBeatEnd = firstRowScrollBeat + div.rows.length / div.split;

    divisionSpans.push({
      divIdx,
      timeStartMs,
      firstRowStartTimeMs,
      timeEndMs,
      beatStart,
      beatEnd,
      scrollBeatStart,
      firstRowScrollBeat,
      scrollBeatEnd,
      delayBeats,
      msPerBeat,
      rowDurationMs,
    });

    div.rows.forEach((cells, rowIdx) => {
      const startTimeMs = firstRowStartTimeMs + rowIdx * rowDurationMs;
      const endTimeMs = startTimeMs + rowDurationMs;
      const beatValue = beatStart + rowIdx / div.split;
      const scrollBeatValue = firstRowScrollBeat + rowIdx / div.split;
      const laneCells = cells.reduce<ActiveLaneCell[]>((acc, cell, colIdx) => {
        if (cell !== ".") acc.push({ colIdx, cell });
        return acc;
      }, []);

      const event: PreviewRowEvent = {
        divIdx,
        rowIdx,
        cells,
        startTimeMs,
        endTimeMs,
        anchorTimeMs: startTimeMs,
        rowDurationMs,
        beatValue,
        scrollBeatValue,
        hasNote: laneCells.length > 0,
        hasHitsound: laneCells.some((lane) => lane.cell === "X" || lane.cell === "M"),
        laneCells,
      };

      rowEvents.push(event);
      rowTimeMap[refKey(divIdx, rowIdx)] = event;
    });

    divisionCursorMs = timeEndMs;
    divisionCursorBeat = beatEnd;
    cumulativeDelayBeats += delayBeats;
  });

  const tapEvents: PreviewTapEvent[] = rowEvents.flatMap((rowEvent) =>
    rowEvent.laneCells
      .filter((lane) => lane.cell === "X")
      .map((lane) => ({
        kind: "tap" as const,
        divIdx: rowEvent.divIdx,
        rowIdx: rowEvent.rowIdx,
        colIdx: lane.colIdx,
        timeMs: rowEvent.startTimeMs,
        scrollBeatValue: rowEvent.scrollBeatValue,
      })),
  );

  const holdEvents: PreviewHoldEvent[] = [];
  const openHoldStarts: Array<PreviewRowEvent | null> = Array.from({ length: CELL_LABELS.length }, () => null);

  rowEvents.forEach((rowEvent) => {
    rowEvent.laneCells.forEach((lane) => {
      if (lane.cell === "M") {
        openHoldStarts[lane.colIdx] = rowEvent;
        return;
      }

      if (lane.cell === "W") {
        const startEvent = openHoldStarts[lane.colIdx];
        if (!startEvent) return;
        holdEvents.push({
          kind: "hold",
          colIdx: lane.colIdx,
          startDivIdx: startEvent.divIdx,
          startRowIdx: startEvent.rowIdx,
          endDivIdx: rowEvent.divIdx,
          endRowIdx: rowEvent.rowIdx,
          startTimeMs: startEvent.startTimeMs,
          endTimeMs: rowEvent.startTimeMs,
          startScrollBeat: startEvent.scrollBeatValue,
          endScrollBeat: rowEvent.scrollBeatValue,
        });
        openHoldStarts[lane.colIdx] = null;
      }
    });
  });

  return {
    rowEvents,
    rowTimeMap,
    tapEvents,
    holdEvents,
    divisionSpans,
    chartStartTimeMs: divisionSpans[0]?.timeStartMs ?? 0,
    chartEndTimeMs: divisionSpans[divisionSpans.length - 1]?.timeEndMs ?? 0,
    chartStartScrollBeat: divisionSpans[0]?.scrollBeatStart ?? 0,
    chartEndScrollBeat: divisionSpans[divisionSpans.length - 1]?.scrollBeatEnd ?? 0,
  };
}

function mapRowIndexToNearest(rowIdx: number, oldSplit: number, newSplit: number): number {
  const scaled = (rowIdx * newSplit) / oldSplit;
  const lower = Math.floor(scaled);
  const upper = Math.ceil(scaled);
  return scaled - lower <= upper - scaled ? lower : upper;
}

function willAdjustSplitChangeDuration(rowCount: number, oldSplit: number, newSplit: number): boolean {
  return rowCount % oldSplit !== 0 && (rowCount * newSplit) % oldSplit !== 0;
}

function computeAdjustedRowCount(rowCount: number, oldSplit: number, newSplit: number): number {
  if (rowCount <= 0) return 1;
  const scaled = (rowCount * newSplit) / oldSplit;
  const lower = Math.floor(scaled);
  const upper = Math.ceil(scaled);
  const nearest = scaled - lower <= upper - scaled ? lower : upper;
  return Math.max(1, nearest);
}

function collectAdjustPrimitives(rows: Cell[][]): AdjustPrimitive[] {
  const primitives: AdjustPrimitive[] = [];

  for (let colIdx = 0; colIdx < CELL_LABELS.length; colIdx += 1) {
    let rowIdx = 0;
    while (rowIdx < rows.length) {
      const value = rows[rowIdx][colIdx];

      if (value === "X") {
        primitives.push({ type: "single", rowIdx, colIdx });
        rowIdx += 1;
        continue;
      }

      if (value === "M") {
        let cursor = rowIdx + 1;
        while (cursor < rows.length && rows[cursor][colIdx] === "H") {
          cursor += 1;
        }
        if (cursor < rows.length && rows[cursor][colIdx] === "W") {
          primitives.push({ type: "long", startRowIdx: rowIdx, endRowIdx: cursor, colIdx });
          rowIdx = cursor + 1;
        } else {
          primitives.push({ type: "partial_start", rowIdx, colIdx });
          rowIdx = Math.max(rowIdx + 1, cursor);
        }
        continue;
      }

      if (value === "W") {
        primitives.push({ type: "partial_end", rowIdx, colIdx });
        rowIdx += 1;
        continue;
      }

      rowIdx += 1;
    }
  }

  return primitives;
}

function adjustDivisionSplit(div: Division, newSplit: number): Division {
  const oldSplit = div.split;
  const newRowCount = computeAdjustedRowCount(div.rows.length, oldSplit, newSplit);
  const nextRows = Array.from({ length: newRowCount }, () => emptyRow());
  const primitives = collectAdjustPrimitives(div.rows);

  const placeX = (rowIdx: number, colIdx: number) => {
    const safeRowIdx = Math.max(0, Math.min(nextRows.length - 1, rowIdx));
    nextRows[safeRowIdx][colIdx] = "X";
  };

  const spanHasConflict = (from: number, to: number, colIdx: number) => {
    for (let rowIdx = from; rowIdx <= to; rowIdx += 1) {
      if (nextRows[rowIdx][colIdx] !== ".") return true;
    }
    return false;
  };

  const placeLongSpan = (from: number, to: number, colIdx: number, fallbackRowIdx: number) => {
    const start = Math.max(0, Math.min(nextRows.length - 1, Math.min(from, to)));
    const end = Math.max(0, Math.min(nextRows.length - 1, Math.max(from, to)));
    if (start === end || spanHasConflict(start, end, colIdx)) {
      placeX(fallbackRowIdx, colIdx);
      return;
    }
    nextRows[start][colIdx] = "M";
    for (let rowIdx = start + 1; rowIdx < end; rowIdx += 1) {
      nextRows[rowIdx][colIdx] = "H";
    }
    nextRows[end][colIdx] = "W";
  };

  const placePartialStart = (startRowIdx: number, colIdx: number) => {
    const start = Math.max(0, Math.min(nextRows.length - 1, startRowIdx));
    if (spanHasConflict(start, nextRows.length - 1, colIdx)) {
      placeX(start, colIdx);
      return;
    }
    nextRows[start][colIdx] = "M";
    for (let rowIdx = start + 1; rowIdx < nextRows.length; rowIdx += 1) {
      nextRows[rowIdx][colIdx] = "H";
    }
  };

  const placePartialEnd = (endRowIdx: number, colIdx: number) => {
    const end = Math.max(0, Math.min(nextRows.length - 1, endRowIdx));
    if (spanHasConflict(0, end, colIdx)) {
      placeX(end, colIdx);
      return;
    }
    for (let rowIdx = 0; rowIdx < end; rowIdx += 1) {
      nextRows[rowIdx][colIdx] = "H";
    }
    nextRows[end][colIdx] = "W";
  };

  primitives.filter((primitive) => primitive.type === "single").forEach((primitive) => {
    placeX(mapRowIndexToNearest(primitive.rowIdx, oldSplit, newSplit), primitive.colIdx);
  });

  primitives.filter((primitive) => primitive.type === "long").forEach((primitive) => {
    const start = mapRowIndexToNearest(primitive.startRowIdx, oldSplit, newSplit);
    const end = mapRowIndexToNearest(primitive.endRowIdx, oldSplit, newSplit);
    placeLongSpan(start, end, primitive.colIdx, start);
  });

  primitives.filter((primitive) => primitive.type === "partial_start").forEach((primitive) => {
    const start = mapRowIndexToNearest(primitive.rowIdx, oldSplit, newSplit);
    placePartialStart(start, primitive.colIdx);
  });

  primitives.filter((primitive) => primitive.type === "partial_end").forEach((primitive) => {
    const end = mapRowIndexToNearest(primitive.rowIdx, oldSplit, newSplit);
    placePartialEnd(end, primitive.colIdx);
  });

  return {
    ...div,
    split: newSplit,
    rows: nextRows,
  };
}

function getEditorNoteTone(colIdx: number, cell: Exclude<Cell, ".">): string {
  const isTap = cell === "X";

  if (colIdx === 0 || colIdx === 4) {
    return isTap
      ? "border-blue-700 bg-blue-700 text-white"
      : "border-blue-300 bg-blue-100 text-blue-800";
  }

  if (colIdx === 1 || colIdx === 3) {
    return isTap
      ? "border-orange-500 bg-orange-500 text-white"
      : "border-orange-300 bg-orange-100 text-orange-800";
  }

  return isTap
    ? "border-amber-400 bg-amber-300 text-amber-950"
    : "border-amber-300 bg-amber-100 text-amber-800";
}

function TemporaryNoteSprite({ colIdx, kind, size = 56 }: { colIdx: number; kind: TempSpriteKind; size?: number }) {
  const src = getSpritePath(colIdx, kind);
  const renderedHeight = kind === "body" ? Math.max(10, Math.round(size * 0.16)) : size;

  return (
    <img
      src={src}
      alt={`${CELL_LABELS[colIdx]}-${kind}`}
      className="object-contain"
      style={{
        width: size,
        height: renderedHeight,
      }}
    />
  );
}

export default function UCSMobileAlpha1() {
  const [divisions, setDivisions] = useState<Division[]>(initialDivisions);
  const [mode, setMode] = useState<Mode>("note");
  const [selectTool, setSelectTool] = useState<SelectTool>("row_single");
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(4);
  const [selectedDivisionIdx, setSelectedDivisionIdx] = useState(0);
  const [selectedRow, setSelectedRow] = useState<RowSelection | null>(null);
  const [multiSelectedRows, setMultiSelectedRows] = useState<RowSelection[]>([]);
  const [selectedCellRange, setSelectedCellRange] = useState<CellRangeSelection | null>(null);
  const [rangeAnchor, setRangeAnchor] = useState<RangeAnchor | null>(null);
  const [clipboardData, setClipboardData] = useState<ClipboardData | null>(null);
  const [pendingLongStart, setPendingLongStart] = useState<LongStart | null>(null);
  const [isTemporaryLongStart, setIsTemporaryLongStart] = useState(false);
  const [manualExpandedGroups, setManualExpandedGroups] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentView, setCurrentView] = useState<ViewMode>("editor");
  const [appSection, setAppSection] = useState<AppSection>("workspace");
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [toolSheetOpen, setToolSheetOpen] = useState(false);
  const [rowDivisionSheetOpen, setRowDivisionSheetOpen] = useState(false);
  const [previewAnchorTimeMs, setPreviewAnchorTimeMs] = useState(0);
  const [previewCursorTimeMs, setPreviewCursorTimeMs] = useState(0);
  const [previewCursorScrollBeat, setPreviewCursorScrollBeat] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewHitsoundVolume, setPreviewHitsoundVolume] = useState(0.7);
  const [previewZoomDraft, setPreviewZoomDraft] = useState("1.0");
  const [previewAudioSrc, setPreviewAudioSrc] = useState("");
  const [previewAudioLabel, setPreviewAudioLabel] = useState("오디오 없음");
  const [previewAudioMode, setPreviewAudioMode] = useState<"none" | "file">("none");
  const [previewAudioStatus, setPreviewAudioStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [previewAudioError, setPreviewAudioError] = useState("");
  const [previewAudioDurationMs, setPreviewAudioDurationMs] = useState<number | null>(null);
  const [recentAudioMeta, setRecentAudioMeta] = useState<PersistedAudioMeta>({
    mode: "none",
    fileName: null,
    mimeType: null,
    size: null,
    durationMs: null,
  });
  const [previewAudioReconnectNeeded, setPreviewAudioReconnectNeeded] = useState(false);
  const [recentProjectAutosaveReady, setRecentProjectAutosaveReady] = useState(false);
  const [editorAnchorTimeMs, setEditorAnchorTimeMs] = useState(0);
  const [appViewportHeight, setAppViewportHeight] = useState<number>(() => (typeof window !== "undefined" ? window.innerHeight : 844));
  const [appViewportWidth, setAppViewportWidth] = useState<number>(() => (typeof window !== "undefined" ? window.innerWidth : 390));
  const [pendingEditorSyncTarget, setPendingEditorSyncTarget] = useState<EditorSyncTarget | null>(null);
  const previewPlaybackBaseRef = useRef(0);
  const previewPlaybackStartedAtRef = useRef<number | null>(null);
  const previewHitsoundAudioContextRef = useRef<AudioContext | null>(null);
  const previewHitsoundBufferRef = useRef<AudioBuffer | null>(null);
  const previewHitsoundLoadPromiseRef = useRef<Promise<AudioBuffer | null> | null>(null);
  const previewHitsoundGainRef = useRef<GainNode | null>(null);
  const previewLastHitsoundRowIndexRef = useRef(-1);
  const previewPlaybackRequestIdRef = useRef(0);
  const previewPlaybackUsesAudioClockRef = useRef(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioFileInputRef = useRef<HTMLInputElement | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const cellLongPressTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const cellLongPressTargetRef = useRef<{ divIdx: number; rowIdx: number; colIdx: number; startX: number; startY: number } | null>(null);
  const suppressCellTapKeyRef = useRef<string | null>(null);
  const rowLongPressTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const rowLongPressTargetRef = useRef<{ divIdx: number; rowIdx: number; startX: number; startY: number } | null>(null);
  const suppressRowTapKeyRef = useRef<string | null>(null);
  const previewDragRef = useRef<{ pointerId: number | null; startY: number; startTimeMs: number }>({
    pointerId: null,
    startY: 0,
    startTimeMs: 0,
  });
  const [previewLaneFlash, setPreviewLaneFlash] = useState<boolean[]>(() => Array(CELL_LABELS.length).fill(false));
  const [previewInfoPanelOpen, setPreviewInfoPanelOpen] = useState(true);
  const recentProjectSaveTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const latestRecentProjectSnapshotRef = useRef<RecentProjectSnapshot | null>(null);
  const previewLaneFlashTimeoutsRef = useRef<Array<ReturnType<typeof window.setTimeout> | null>>(
    Array.from({ length: CELL_LABELS.length }, () => null),
  );
  const [toast, setToast] = useState("UCS Mobile Alpha 1: 비정수 배율 tuplet 경계 유령 행 반영");
  const [importTextOpen, setImportTextOpen] = useState(false);
  const [importTextDraft, setImportTextDraft] = useState("");
  const [resizeOpen, setResizeOpen] = useState(false);
  const [propertyOpen, setPropertyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustWarningOpen, setAdjustWarningOpen] = useState(false);
  const [pendingAdjustTarget, setPendingAdjustTarget] = useState<number | null>(null);
  const [resizeDraft, setResizeDraft] = useState(String(initialDivisions[0].rows.length));
  const [propertyDraft, setPropertyDraft] = useState<PropertyDraft>({
    bpm: String(initialDivisions[0].bpm),
    delay: formatRounded(initialDivisions[0].delay, 5),
    beat: String(initialDivisions[0].beat),
    split: String(initialDivisions[0].split),
  });
  const [delayUnit, setDelayUnit] = useState<DelayUnit>("ms");
  const [adjustDraft, setAdjustDraft] = useState<AdjustSplitDraft>({ nextSplit: String(initialDivisions[0].split) });
  const [undoStack, setUndoStack] = useState<EditorSnapshot[]>([]);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const editorRowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const clearAllSelection = () => {
    setSelectedRow(null);
    setMultiSelectedRows([]);
    setSelectedCellRange(null);
    setRangeAnchor(null);
    setPendingLongStart(null);
    setIsTemporaryLongStart(false);
  };

  const createSnapshot = (): EditorSnapshot => ({
    divisions: cloneDivisions(divisions),
    selectedDivisionIdx,
    selectedRow: selectedRow ? { ...selectedRow } : null,
    multiSelectedRows: multiSelectedRows.map((row) => ({ ...row })),
    selectedCellRange: selectedCellRange ? { ...selectedCellRange } : null,
    rangeAnchor: rangeAnchor ? { ...rangeAnchor } : null,
    pendingLongStart: pendingLongStart ? { ...pendingLongStart } : null,
    isTemporaryLongStart,
    manualExpandedGroups: [...manualExpandedGroups],
    mode,
    selectTool,
  });

  const pushUndoSnapshot = () => {
    const snapshot = createSnapshot();
    setUndoStack((prev) => [...prev.slice(-49), snapshot]);
  };

  const applySnapshot = (snapshot: EditorSnapshot) => {
    setDivisions(cloneDivisions(snapshot.divisions));
    setSelectedDivisionIdx(snapshot.selectedDivisionIdx);
    setSelectedRow(snapshot.selectedRow ? { ...snapshot.selectedRow } : null);
    setMultiSelectedRows(snapshot.multiSelectedRows.map((row) => ({ ...row })));
    setSelectedCellRange(snapshot.selectedCellRange ? { ...snapshot.selectedCellRange } : null);
    setRangeAnchor(snapshot.rangeAnchor ? { ...snapshot.rangeAnchor } : null);
    setPendingLongStart(snapshot.pendingLongStart ? { ...snapshot.pendingLongStart } : null);
    setIsTemporaryLongStart(snapshot.isTemporaryLongStart);
    setManualExpandedGroups([...snapshot.manualExpandedGroups]);
    setMode(snapshot.mode);
    setSelectTool(snapshot.selectTool);
  };

  const undoLastChange = () => {
    if (undoStack.length === 0) {
      setToast("되돌릴 편집이 없습니다.");
      return;
    }
    const snapshot = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    applySnapshot(snapshot);
    setAdjustOpen(false);
    setAdjustWarningOpen(false);
    setPropertyOpen(false);
    setResizeOpen(false);
    setDeleteOpen(false);
    setToast("마지막 편집을 되돌렸습니다.");
  };

  const selectedDivision = divisions[selectedDivisionIdx];
  const [exportFileNameInput, setExportFileNameInput] = useState("test");
  const currentUcsFileName = useMemo(() => buildUcsFileName(exportFileNameInput), [exportFileNameInput]);
  const rowsPerMeasure = selectedDivision.beat * selectedDivision.split;
  const previewTimingData = useMemo(() => buildPreviewTimingData(divisions), [divisions]);
  const previewLongValidation = useMemo(() => validatePreviewLongNotes(divisions), [divisions]);
  const selectedRowTiming = selectedRow ? previewTimingData.rowTimeMap[refKey(selectedRow.divIdx, selectedRow.rowIdx)] ?? null : null;
  const currentAnchorTimeMs = editorAnchorTimeMs || selectedRowTiming?.anchorTimeMs || previewTimingData.rowEvents[0]?.anchorTimeMs || 0;
  const serializedUcs = useMemo(() => serialize(divisions), [divisions]);

  const copyUcsText = async () => {
    try {
      await navigator.clipboard.writeText(serializedUcs);
      setToast(`UCS 텍스트를 복사했습니다: ${currentUcsFileName}`);
    } catch {
      setToast("클립보드 복사에 실패했습니다.");
    }
  };

  const downloadUcsFile = () => {
    try {
      const blob = new Blob([serializedUcs], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = currentUcsFileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setToast(`UCS 파일을 다운로드했습니다: ${currentUcsFileName}`);
    } catch {
      setToast("UCS 파일 다운로드에 실패했습니다.");
    }
  };

  const handleExportFileNameChange = (value: string) => {
    setExportFileNameInput(sanitizeUcsFileNameInput(value));
  };

  const openWorkspaceSection = () => {
    setAppSection("workspace");
    setLeftPanelOpen(false);
  };

  const closeToolSheet = () => {
    setToolSheetOpen(false);
  };

  const closeRowDivisionSheet = () => {
    setRowDivisionSheetOpen(false);
  };

  const openFileSection = () => {
    previewPlaybackRequestIdRef.current += 1;
    previewPlaybackUsesAudioClockRef.current = false;
    previewPlaybackBaseRef.current = previewCursorTimeMs;
    previewPlaybackStartedAtRef.current = null;
    setIsPlaying(false);
    previewAudioRef.current?.pause();
    setAppSection("file");
    setLeftPanelOpen(false);
    setToolSheetOpen(false);
    setToast("파일 화면을 열었습니다.");
  };

  const createNewUcs = () => {
    applyImportedDivisions(cloneDivisions(initialDivisions), "새 UCS", "untitled");
  };

  const openImportText = () => {
    setImportTextDraft("");
    setImportTextOpen(true);
  };

  const applyImportedDivisions = (importedDivisions: Division[], sourceLabel: string, nextFileNameInput?: string) => {
    if (nextFileNameInput !== undefined) {
      setExportFileNameInput(sanitizeUcsFileNameInput(stripUcsExtension(nextFileNameInput)) || "untitled");
    }
    pushUndoSnapshot();
    setDivisions(importedDivisions);
    setSelectedDivisionIdx(0);
    setSelectedRow({ divIdx: 0, rowIdx: 0 });
    setMultiSelectedRows([]);
    setSelectedCellRange(null);
    setRangeAnchor(null);
    setPendingLongStart(null);
    setIsTemporaryLongStart(false);
    setManualExpandedGroups([]);
    setMode("note");
    setSelectTool("row_single");
    setCurrentView("editor");
    setIsPlaying(false);
    previewAudioRef.current?.pause();
    previewPlaybackBaseRef.current = 0;
    previewPlaybackStartedAtRef.current = null;
    setEditorAnchorTimeMs(0);
    setPendingEditorSyncTarget({ divIdx: 0, rowIdx: 0, timeMs: 0 });
    setImportTextOpen(false);
    const totalRows = importedDivisions.reduce((sum, div) => sum + div.rows.length, 0);
    setToast(`${sourceLabel}에서 UCS를 불러왔습니다. Division ${importedDivisions.length}개, 전체 ${totalRows}행입니다.`);
  };

  const clearRecentProjectSaveTimeout = () => {
    if (recentProjectSaveTimeoutRef.current !== null) {
      window.clearTimeout(recentProjectSaveTimeoutRef.current);
      recentProjectSaveTimeoutRef.current = null;
    }
  };

  const buildRecentProjectSnapshot = (): RecentProjectSnapshot => ({
    version: RECENT_PROJECT_SCHEMA_VERSION,
    projectId: RECENT_PROJECT_ID,
    updatedAt: Date.now(),
    exportFileNameInput,
    divisions: cloneDivisions(divisions),
    ui: {
      appSection,
      currentView,
      selectedDivisionIdx,
      selectedRow: selectedRow ? { ...selectedRow } : null,
      previewAnchorTimeMs,
      previewZoom,
      previewHitsoundVolume,
      previewInfoPanelOpen,
    },
    audio: {
      ...recentAudioMeta,
      durationMs: recentAudioMeta.mode === "file" ? previewAudioDurationMs ?? recentAudioMeta.durationMs : recentAudioMeta.durationMs,
    },
  });

  const persistRecentProjectNow = async (snapshot: RecentProjectSnapshot, notifyOnError = false) => {
    try {
      await saveRecentProjectSnapshot(snapshot);
      latestRecentProjectSnapshotRef.current = snapshot;
    } catch {
      if (notifyOnError) {
        setToast("자동 저장에 실패했습니다.");
      }
    }
  };

  const applyRecentProjectSnapshot = (snapshot: RecentProjectSnapshot) => {
    const nextDivisions = snapshot.divisions.length > 0 ? cloneDivisions(snapshot.divisions) : cloneDivisions(initialDivisions);
    const nextTimingData = buildPreviewTimingData(nextDivisions);
    const nextSelectedDivisionIdx = Math.max(0, Math.min(snapshot.ui.selectedDivisionIdx, nextDivisions.length - 1));
    const rawSelectedRow = snapshot.ui.selectedRow;
    const nextSelectedRow = rawSelectedRow && nextDivisions[rawSelectedRow.divIdx]?.rows[rawSelectedRow.rowIdx]
      ? { divIdx: rawSelectedRow.divIdx, rowIdx: rawSelectedRow.rowIdx }
      : null;
    const restoredAnchorTimeMs = Math.max(
      nextTimingData.chartStartTimeMs,
      Math.min(nextTimingData.chartEndTimeMs, snapshot.ui.previewAnchorTimeMs),
    );
    const restoredScrollBeat = getPreviewScrollBeatByTime(nextTimingData.divisionSpans, restoredAnchorTimeMs);
    const restoredZoom = normalizePreviewZoom(snapshot.ui.previewZoom);
    const restoredVolume = normalizeHitsoundVolume(snapshot.ui.previewHitsoundVolume);
    const restoredAudioMeta = snapshot.audio ?? {
      mode: "none",
      fileName: null,
      mimeType: null,
      size: null,
      durationMs: null,
    };
    const hasReconnectableAudio = restoredAudioMeta.mode === "file" && Boolean(restoredAudioMeta.fileName);

    setDivisions(nextDivisions);
    setExportFileNameInput(sanitizeUcsFileNameInput(stripUcsExtension(snapshot.exportFileNameInput)) || "untitled");
    setSelectedDivisionIdx(nextSelectedDivisionIdx);
    setSelectedRow(nextSelectedRow);
    setMultiSelectedRows([]);
    setSelectedCellRange(null);
    setRangeAnchor(null);
    setPendingLongStart(null);
    setIsTemporaryLongStart(false);
    setManualExpandedGroups([]);
    setMode("note");
    setSelectTool("row_single");
    setAppSection(snapshot.ui.appSection);
    setCurrentView(snapshot.ui.currentView);
    setPreviewAnchorTimeMs(restoredAnchorTimeMs);
    setPreviewCursorTimeMs(restoredAnchorTimeMs);
    setPreviewCursorScrollBeat(restoredScrollBeat);
    setPreviewZoom(restoredZoom);
    setPreviewZoomDraft(restoredZoom.toFixed(1));
    setPreviewHitsoundVolume(restoredVolume);
    setPreviewInfoPanelOpen(snapshot.ui.previewInfoPanelOpen);
    setEditorAnchorTimeMs(restoredAnchorTimeMs);
    setPendingEditorSyncTarget(nextSelectedRow && snapshot.ui.currentView === "editor" ? { ...nextSelectedRow, timeMs: restoredAnchorTimeMs } : null);
    previewPlaybackRequestIdRef.current += 1;
    previewPlaybackUsesAudioClockRef.current = false;
    previewPlaybackBaseRef.current = restoredAnchorTimeMs;
    previewPlaybackStartedAtRef.current = null;
    previewLastHitsoundRowIndexRef.current = -1;
    setIsPlaying(false);
    previewAudioRef.current?.pause();
    setPreviewAudioSrc("");
    setPreviewAudioMode("none");
    setPreviewAudioReconnectNeeded(hasReconnectableAudio);
    setPreviewAudioLabel(hasReconnectableAudio ? `이전 오디오: ${restoredAudioMeta.fileName}` : "오디오 없음");
    setPreviewAudioStatus("idle");
    setPreviewAudioError("");
    setPreviewAudioDurationMs(null);
    setRecentAudioMeta(restoredAudioMeta);
    setToast(hasReconnectableAudio ? "최근 작업과 오디오 메타를 복원했습니다. 오디오는 다시 연결해야 합니다." : "최근 작업을 복원했습니다.");
  };

  useEffect(() => {
    let cancelled = false;

    const restoreRecentProject = async () => {
      try {
        const snapshot = await loadRecentProjectSnapshot();
        if (cancelled) return;
        if (snapshot) {
          latestRecentProjectSnapshotRef.current = snapshot;
          applyRecentProjectSnapshot(snapshot);
        }
      } catch {
        if (!cancelled) {
          setToast("최근 작업 복원 없이 새 세션으로 시작합니다.");
        }
      } finally {
        if (!cancelled) {
          setRecentProjectAutosaveReady(true);
          latestRecentProjectSnapshotRef.current = latestRecentProjectSnapshotRef.current ?? buildRecentProjectSnapshot();
        }
      }
    };

    void restoreRecentProject();

    return () => {
      cancelled = true;
      clearRecentProjectSaveTimeout();
    };
  }, []);

  useEffect(() => {
    if (!recentProjectAutosaveReady) return;

    const snapshot = buildRecentProjectSnapshot();
    latestRecentProjectSnapshotRef.current = snapshot;
    clearRecentProjectSaveTimeout();
    recentProjectSaveTimeoutRef.current = window.setTimeout(() => {
      void persistRecentProjectNow(snapshot, true);
      recentProjectSaveTimeoutRef.current = null;
    }, RECENT_PROJECT_AUTOSAVE_DELAY_MS);

    return clearRecentProjectSaveTimeout;
  }, [
    recentProjectAutosaveReady,
    divisions,
    exportFileNameInput,
    appSection,
    currentView,
    selectedDivisionIdx,
    selectedRow,
    previewAnchorTimeMs,
    previewZoom,
    previewHitsoundVolume,
    previewInfoPanelOpen,
    recentAudioMeta,
    previewAudioDurationMs,
  ]);

  useEffect(() => {
    const flushRecentProject = () => {
      if (!recentProjectAutosaveReady) return;
      const snapshot = latestRecentProjectSnapshotRef.current ?? buildRecentProjectSnapshot();
      latestRecentProjectSnapshotRef.current = snapshot;
      clearRecentProjectSaveTimeout();
      void persistRecentProjectNow(snapshot, false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushRecentProject();
      }
    };

    window.addEventListener("pagehide", flushRecentProject);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushRecentProject);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [recentProjectAutosaveReady]);

  const importUcsFromText = () => {
    const source = importTextDraft.trim();
    if (!source) {
      setToast("붙여넣을 UCS 텍스트를 입력하세요.");
      return;
    }

    const sourceBytes = getTextByteLength(source);
    if (sourceBytes > MAX_UCS_IMPORT_BYTES) {
      setToast(
        `텍스트 가져오기 실패${String.fromCharCode(10)}UCS 데이터 크기는 최대 ${formatImportSize(MAX_UCS_IMPORT_BYTES)}까지만 가져올 수 있습니다. 현재 ${formatImportSize(sourceBytes)}입니다.`,
      );
      return;
    }

    try {
      const importedDivisions = parseUcsText(source);
      applyImportedDivisions(importedDivisions, "텍스트 붙여넣기");
    } catch (error) {
      setToast(
        error instanceof Error
          ? `텍스트 가져오기 실패${String.fromCharCode(10)}${error.message}`
          : "텍스트 가져오기에 실패했습니다.",
      );
    }
  };

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_UCS_IMPORT_BYTES) {
      setToast(
        `파일 가져오기 실패 · ${file.name}${String.fromCharCode(10)}UCS 데이터 크기는 최대 ${formatImportSize(MAX_UCS_IMPORT_BYTES)}까지만 가져올 수 있습니다. 현재 ${formatImportSize(file.size)}입니다.`,
      );
      return;
    }

    try {
      const source = await file.text();
      const importedDivisions = parseUcsText(source);
      applyImportedDivisions(importedDivisions, file.name, file.name);
    } catch (error) {
      const message = formatUcsImportErrorMessage(error, file.name);
      setToast(message);
    }
  };

  useEffect(() => {
    const updateViewportSize = () => {
      setAppViewportHeight(window.innerHeight);
      setAppViewportWidth(window.innerWidth);
    };
    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    return () => window.removeEventListener("resize", updateViewportSize);
  }, []);

  const previewViewportHeight = Math.max(320, Math.min(560, appViewportHeight - 250));
  const previewAppWidth = Math.min(appViewportWidth, 448);
  const previewCardInnerWidth = Math.max(280, previewAppWidth - 32);
  const previewLaneContentWidth = Math.max(220, previewCardInnerWidth - 40);
  const previewLaneWidth = previewLaneContentWidth / CELL_LABELS.length;
  const previewNoteSize = Math.min(
    PREVIEW_BASE_NOTE_SIZE,
    Math.max(PREVIEW_MIN_NOTE_SIZE, roundToDecimals(previewLaneWidth * 0.82, 1)),
  );
  const previewBodyWidth = previewNoteSize;
  const previewLaneScale = previewNoteSize / PREVIEW_BASE_NOTE_SIZE;
  const previewLaneInwardOffsets = PREVIEW_BASE_LANE_INWARD_OFFSETS.map((offset) => roundToDecimals(offset * previewLaneScale, 1));
  const editorScrollBottomPadding = previewViewportHeight * (1 - EDITOR_JUDGE_LINE_RATIO) + 48;
  const previewJudgeLineY = previewViewportHeight * PREVIEW_JUDGE_LINE_RATIO;
  const previewBeatToPx = previewNoteSize * previewZoom;
  const previewMinTimeMs = previewTimingData.chartStartTimeMs - PREVIEW_START_PADDING_MS;
  const previewMaxTimeMs = previewTimingData.chartEndTimeMs + PREVIEW_END_PADDING_MS;
  const previewMinScrollBeat = previewTimingData.chartStartScrollBeat;
  const previewMaxScrollBeat = previewTimingData.chartEndScrollBeat;
  const previewProgressRatio = useMemo(() => {
    const duration = Math.max(1, previewMaxTimeMs - previewMinTimeMs);
    return Math.min(1, Math.max(0, (previewCursorTimeMs - previewMinTimeMs) / duration));
  }, [previewCursorTimeMs, previewMaxTimeMs, previewMinTimeMs]);
  const previewProgressPercent = Math.round(previewProgressRatio * 100);
  const previewProgressCurrentMs = Math.max(0, previewCursorTimeMs - previewMinTimeMs);
  const previewProgressDurationMs = Math.max(0, previewMaxTimeMs - previewMinTimeMs);
  const previewTotalCombo = useMemo(() => previewTimingData.rowEvents.filter((row) => row.hasNote).length, [previewTimingData.rowEvents]);
  const previewCurrentCombo = useMemo(
    () => previewTimingData.rowEvents.filter((row) => row.hasNote && row.startTimeMs <= previewCursorTimeMs + 0.001).length,
    [previewCursorTimeMs, previewTimingData.rowEvents],
  );
  const previewCurrentRowRef = useMemo(() => resolveEditorSyncRowByTime(previewTimingData, previewCursorTimeMs), [previewTimingData, previewCursorTimeMs]);
  const previewCurrentRowText = previewCurrentRowRef
    ? `Div ${previewCurrentRowRef.divIdx + 1} · Row ${previewCurrentRowRef.rowIdx + 1}`
    : "행 정보 없음";
  const previewCurrentRowLabelText = previewCurrentRowRef
    ? actualRowLabel(divisions, previewCurrentRowRef.divIdx, previewCurrentRowRef.rowIdx)
    : "-";

  const setPreviewScrollTime = (timeMs: number) => {
    const nextTimeMs = Math.max(previewMinTimeMs, Math.min(previewMaxTimeMs, timeMs));
    const nextScrollBeat = getPreviewScrollBeatByTime(previewTimingData.divisionSpans, nextTimeMs);
    setPreviewCursorTimeMs(nextTimeMs);
    setPreviewCursorScrollBeat(nextScrollBeat);
    setPreviewAnchorTimeMs(nextTimeMs);
    previewPlaybackUsesAudioClockRef.current = false;
    previewPlaybackBaseRef.current = nextTimeMs;
    previewPlaybackStartedAtRef.current = null;
    syncPreviewHitsoundPointer(nextTimeMs);
    writePreviewAudioTime(nextTimeMs);
    return nextTimeMs;
  };

  const setPreviewScrollBeat = (scrollBeat: number) => {
    const nextScrollBeat = Math.max(previewMinScrollBeat, Math.min(previewMaxScrollBeat, scrollBeat));
    const nextTimeMs = getPreviewTimeByScrollBeat(previewTimingData.divisionSpans, nextScrollBeat);
    setPreviewCursorScrollBeat(nextScrollBeat);
    setPreviewCursorTimeMs(nextTimeMs);
    setPreviewAnchorTimeMs(nextTimeMs);
    previewPlaybackUsesAudioClockRef.current = false;
    previewPlaybackBaseRef.current = nextTimeMs;
    previewPlaybackStartedAtRef.current = null;
    syncPreviewHitsoundPointer(nextTimeMs);
    writePreviewAudioTime(nextTimeMs);
    return nextScrollBeat;
  };

  const handlePreviewWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (isPlaying) return;
    event.preventDefault();
    const deltaScrollBeat = event.deltaY / previewBeatToPx;
    setPreviewScrollBeat(previewCursorScrollBeat + deltaScrollBeat);
  };

  const handlePreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isPlaying) return;
    previewDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTimeMs: previewCursorTimeMs,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePreviewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isPlaying) return;
    const drag = previewDragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    const deltaY = event.clientY - drag.startY;
    setPreviewScrollBeat(getPreviewScrollBeatByTime(previewTimingData.divisionSpans, drag.startTimeMs) - deltaY / previewBeatToPx);
  };

  const handlePreviewPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (previewDragRef.current.pointerId !== event.pointerId) return;
    previewDragRef.current = { pointerId: null, startY: 0, startTimeMs: previewCursorTimeMs };
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const getPreviewHitsoundAudioContext = () => {
    if (previewHitsoundAudioContextRef.current) return previewHitsoundAudioContextRef.current;
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;

    const context = new AudioContextCtor();
    const gainNode = context.createGain();
    gainNode.gain.value = normalizeHitsoundVolume(previewHitsoundVolume);
    gainNode.connect(context.destination);

    previewHitsoundAudioContextRef.current = context;
    previewHitsoundGainRef.current = gainNode;
    return context;
  };

  const ensurePreviewHitsoundBuffer = async () => {
    if (previewHitsoundBufferRef.current) return previewHitsoundBufferRef.current;
    if (previewHitsoundLoadPromiseRef.current) return previewHitsoundLoadPromiseRef.current;

    const context = getPreviewHitsoundAudioContext();
    if (!context) return null;

    const loadPromise = fetch(PREVIEW_HITSOUND_URL)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`hitsound fetch failed: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return context.decodeAudioData(arrayBuffer.slice(0));
      })
      .then((buffer) => {
        previewHitsoundBufferRef.current = buffer;
        return buffer;
      })
      .catch(() => null)
      .finally(() => {
        previewHitsoundLoadPromiseRef.current = null;
      });

    previewHitsoundLoadPromiseRef.current = loadPromise;
    return loadPromise;
  };

  const resumePreviewHitsoundContext = async () => {
    const context = getPreviewHitsoundAudioContext();
    if (!context) return null;
    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        // noop
      }
    }
    void ensurePreviewHitsoundBuffer();
    return context;
  };

  const playPreviewHitsound = () => {
    const context = previewHitsoundAudioContextRef.current;
    const buffer = previewHitsoundBufferRef.current;
    const gainNode = previewHitsoundGainRef.current;

    if (!context || !buffer || !gainNode) {
      void resumePreviewHitsoundContext();
      return;
    }

    if (context.state === "suspended") {
      void context.resume();
      return;
    }

    try {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode);
      source.start();
    } catch {
      // noop
    }
  };

  const clearAllPreviewLaneFlash = () => {
    previewLaneFlashTimeoutsRef.current.forEach((timeoutId, colIdx) => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        previewLaneFlashTimeoutsRef.current[colIdx] = null;
      }
    });
    setPreviewLaneFlash(Array(CELL_LABELS.length).fill(false));
  };

  const triggerPreviewLaneFlash = (colIdx: number) => {
    const timeoutId = previewLaneFlashTimeoutsRef.current[colIdx];
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    setPreviewLaneFlash((prev) => prev.map((value, index) => (index === colIdx ? true : value)));
    previewLaneFlashTimeoutsRef.current[colIdx] = window.setTimeout(() => {
      previewLaneFlashTimeoutsRef.current[colIdx] = null;
      setPreviewLaneFlash((prev) => prev.map((value, index) => (index === colIdx ? false : value)));
    }, 110);
  };

  const triggerPreviewLaneFeedback = (laneCells: ActiveLaneCell[]) => {
    laneCells.forEach((lane) => {
      if (lane.cell === "X" || lane.cell === "M") {
        triggerPreviewLaneFlash(lane.colIdx);
      }
    });
  };

  const syncPreviewHitsoundPointer = (timeMs: number) => {
    let lastIndex = -1;
    for (let index = 0; index < previewTimingData.rowEvents.length; index += 1) {
      const row = previewTimingData.rowEvents[index];
      if (!row.hasHitsound) continue;
      if (row.startTimeMs <= timeMs + 0.001) {
        lastIndex = index;
      } else {
        break;
      }
    }
    previewLastHitsoundRowIndexRef.current = lastIndex;
  };

  useEffect(() => {
    void ensurePreviewHitsoundBuffer();
    return () => {
      previewHitsoundLoadPromiseRef.current = null;
      previewHitsoundBufferRef.current = null;
      previewHitsoundGainRef.current?.disconnect();
      previewHitsoundGainRef.current = null;
      const context = previewHitsoundAudioContextRef.current;
      previewHitsoundAudioContextRef.current = null;
      if (context) {
        void context.close().catch(() => undefined);
      }
      previewLaneFlashTimeoutsRef.current.forEach((timeoutId, colIdx) => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          previewLaneFlashTimeoutsRef.current[colIdx] = null;
        }
      });
    };
  }, []);

  useEffect(() => {
    if (previewHitsoundGainRef.current) {
      previewHitsoundGainRef.current.gain.value = normalizeHitsoundVolume(previewHitsoundVolume);
    }
  }, [previewHitsoundVolume]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    previewAudioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
      previewAudioRef.current = null;
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
    };
  }, []);

  const writePreviewAudioTime = (timeMs: number) => {
    const audio = previewAudioRef.current;
    if (!audio || !previewAudioSrc) return;
    try {
      audio.currentTime = Math.max(0, timeMs / 1000);
    } catch {
      // noop
    }
  };

  const readPreviewAudioClockTime = () => {
    const audio = previewAudioRef.current;
    if (!previewPlaybackUsesAudioClockRef.current || !audio || !previewAudioSrc) return null;
    return Math.max(previewMinTimeMs, Math.min(previewMaxTimeMs, audio.currentTime * 1000));
  };

  const waitForPreviewAudioEvent = (audio: HTMLAudioElement, eventName: "loadedmetadata" | "canplay" | "playing", timeoutMs = 2500) =>
    new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        audio.removeEventListener(eventName, handleEvent);
        reject(new Error(`${eventName} timeout`));
      }, timeoutMs);

      const handleEvent = () => {
        window.clearTimeout(timeoutId);
        audio.removeEventListener(eventName, handleEvent);
        resolve();
      };

      audio.addEventListener(eventName, handleEvent);
    });

  const startPreviewPlaybackSynced = async (startTimeMs: number, successMessage: string) => {
    void resumePreviewHitsoundContext();
    const requestId = previewPlaybackRequestIdRef.current + 1;
    previewPlaybackRequestIdRef.current = requestId;
    previewPlaybackUsesAudioClockRef.current = false;

    const nextTimeMs = Math.max(previewMinTimeMs, Math.min(previewMaxTimeMs, startTimeMs));
    const nextScrollBeat = getPreviewScrollBeatByTime(previewTimingData.divisionSpans, nextTimeMs);

    clearAllPreviewLaneFlash();
    previewPlaybackBaseRef.current = nextTimeMs;
    previewPlaybackStartedAtRef.current = null;
    setPreviewAnchorTimeMs(nextTimeMs);
    setPreviewCursorTimeMs(nextTimeMs);
    setPreviewCursorScrollBeat(nextScrollBeat);
    syncPreviewHitsoundPointer(nextTimeMs);
    setIsPlaying(false);

    const audio = previewAudioRef.current;
    if (!audio || !previewAudioSrc) {
      if (previewPlaybackRequestIdRef.current !== requestId) return;
      previewPlaybackUsesAudioClockRef.current = false;
      previewPlaybackBaseRef.current = nextTimeMs;
      previewPlaybackStartedAtRef.current = performance.now();
      setIsPlaying(true);
      setToast(previewAudioReconnectNeeded ? "오디오가 아직 다시 연결되지 않아 차트만 재생합니다." : successMessage);
      return;
    }

    try {
      audio.pause();
      if (audio.readyState < 1) {
        audio.load();
        await waitForPreviewAudioEvent(audio, "loadedmetadata");
      }
      if (previewPlaybackRequestIdRef.current !== requestId) return;

      try {
        audio.currentTime = Math.max(0, nextTimeMs / 1000);
      } catch {
        // noop
      }

      if (audio.readyState < 3) {
        await waitForPreviewAudioEvent(audio, "canplay").catch(() => undefined);
      }
      if (previewPlaybackRequestIdRef.current !== requestId) return;

      const playingPromise = waitForPreviewAudioEvent(audio, "playing").catch(() => undefined);
      const playResult = audio.play();
      if (playResult !== undefined) {
        await playResult;
      }
      await playingPromise;
      if (previewPlaybackRequestIdRef.current !== requestId) return;

      const actualStartTimeMs = Math.max(0, audio.currentTime * 1000);
      previewPlaybackUsesAudioClockRef.current = true;
      previewPlaybackBaseRef.current = actualStartTimeMs;
      previewPlaybackStartedAtRef.current = null;
      setPreviewAnchorTimeMs(actualStartTimeMs);
      setPreviewCursorTimeMs(actualStartTimeMs);
      setPreviewCursorScrollBeat(getPreviewScrollBeatByTime(previewTimingData.divisionSpans, actualStartTimeMs));
      syncPreviewHitsoundPointer(actualStartTimeMs);
      setIsPlaying(true);
      setToast(successMessage);
    } catch {
      if (previewPlaybackRequestIdRef.current !== requestId) return;
      previewPlaybackUsesAudioClockRef.current = false;
      previewPlaybackBaseRef.current = nextTimeMs;
      previewPlaybackStartedAtRef.current = performance.now();
      setIsPlaying(true);
      setToast("오디오 준비를 기다리지 못해 차트만 먼저 재생합니다.");
    }
  };

  useEffect(() => {
    const audio = previewAudioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (!Number.isFinite(audio.duration)) return;
      const durationMs = audio.duration * 1000;
      if (durationMs > MAX_PREVIEW_AUDIO_DURATION_MS) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        if (previewObjectUrlRef.current) {
          URL.revokeObjectURL(previewObjectUrlRef.current);
          previewObjectUrlRef.current = null;
        }
        setPreviewAudioSrc("");
        setPreviewAudioLabel("오디오 없음");
        setPreviewAudioMode("none");
        setPreviewAudioReconnectNeeded(false);
        setPreviewAudioStatus("error");
        setPreviewAudioError(`오디오 길이는 최대 ${formatDurationLabel(MAX_PREVIEW_AUDIO_DURATION_MS)}까지만 허용됩니다. 현재 ${formatDurationLabel(durationMs)}입니다.`);
        setPreviewAudioDurationMs(null);
        setRecentAudioMeta({ mode: "none", fileName: null, mimeType: null, size: null, durationMs: null });
        if (previewAudioFileInputRef.current) previewAudioFileInputRef.current.value = "";
        setToast(`오디오 길이 제한을 초과했습니다. 최대 ${formatDurationLabel(MAX_PREVIEW_AUDIO_DURATION_MS)}까지 업로드할 수 있습니다.`);
        return;
      }
      setPreviewAudioDurationMs(durationMs);
      setRecentAudioMeta((prev) => (prev.mode === "file" ? { ...prev, durationMs } : prev));
    };

    const handleCanPlay = () => {
      setPreviewAudioStatus("ready");
      setPreviewAudioError("");
    };

    const handleError = () => {
      if (!previewAudioSrc) return;
      setPreviewAudioStatus("error");
      setPreviewAudioError("오디오를 불러오지 못했습니다. URL 또는 파일 상태를 확인하세요.");
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("error", handleError);

    if (!previewAudioSrc) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setPreviewAudioStatus("idle");
      setPreviewAudioError("");
      setPreviewAudioDurationMs(null);
      return () => {
        audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audio.removeEventListener("canplay", handleCanPlay);
        audio.removeEventListener("error", handleError);
      };
    }

    if (audio.src !== previewAudioSrc) {
      audio.pause();
      setPreviewAudioStatus("loading");
      setPreviewAudioError("");
      setPreviewAudioDurationMs(null);
      audio.src = previewAudioSrc;
      audio.load();
      writePreviewAudioTime(previewCursorTimeMs);
    }

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("error", handleError);
    };
  }, [previewAudioSrc]);

  useEffect(() => {
    const audio = previewAudioRef.current;
    if (!audio) return;

    if (!previewAudioSrc) {
      audio.pause();
      return;
    }

    if (currentView !== "preview" || !isPlaying) {
      audio.pause();
      writePreviewAudioTime(previewCursorTimeMs);
    }
  }, [currentView, isPlaying, previewAudioSrc, previewCursorTimeMs]);

  const loadPreviewAudioFromUrl = () => {
    setToast(
      ALLOW_REMOTE_PREVIEW_AUDIO
        ? "원격 오디오 정책을 확인하세요."
        : "보안 설정으로 원격 오디오 URL 입력은 비활성화되어 있습니다.",
    );
  };

  const clearPreviewAudio = () => {
    previewPlaybackRequestIdRef.current += 1;
    previewPlaybackUsesAudioClockRef.current = false;
    const audio = previewAudioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    setPreviewAudioSrc("");
    setPreviewAudioLabel("오디오 없음");
    setPreviewAudioMode("none");
    setPreviewAudioReconnectNeeded(false);
    setPreviewAudioStatus("idle");
    setPreviewAudioError("");
    setPreviewAudioDurationMs(null);
    setRecentAudioMeta({ mode: "none", fileName: null, mimeType: null, size: null, durationMs: null });
    if (previewAudioFileInputRef.current) previewAudioFileInputRef.current.value = "";
    setToast("프리뷰 오디오를 제거했습니다.");
  };

  const dismissPreviewAudioReconnect = () => {
    previewPlaybackUsesAudioClockRef.current = false;
    setPreviewAudioSrc("");
    setPreviewAudioLabel("오디오 없음");
    setPreviewAudioMode("none");
    setPreviewAudioReconnectNeeded(false);
    setPreviewAudioStatus("idle");
    setPreviewAudioError("");
    setPreviewAudioDurationMs(null);
    setRecentAudioMeta({ mode: "none", fileName: null, mimeType: null, size: null, durationMs: null });
    if (previewAudioFileInputRef.current) previewAudioFileInputRef.current.value = "";
    setToast("이전 오디오 다시 연결 안내를 해제했습니다.");
  };

  const handlePreviewAudioFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const reconnectExpectedFileName = previewAudioReconnectNeeded ? recentAudioMeta.fileName : null;
    if (!file) return;

    if (file.size > MAX_PREVIEW_AUDIO_BYTES) {
      setPreviewAudioStatus("error");
      setPreviewAudioError(`오디오 파일 크기는 최대 ${formatImportSize(MAX_PREVIEW_AUDIO_BYTES)}까지만 허용됩니다. 현재 ${formatImportSize(file.size)}입니다.`);
      setToast(`오디오 업로드 실패: 최대 ${formatImportSize(MAX_PREVIEW_AUDIO_BYTES)}까지 업로드할 수 있습니다.`);
      event.target.value = "";
      return;
    }

    if (!isAllowedPreviewAudioFile(file)) {
      setPreviewAudioStatus("error");
      setPreviewAudioError("지원하지 않는 오디오 형식입니다. mp3, wav, ogg, m4a, webm 파일만 업로드할 수 있습니다.");
      setToast("오디오 업로드 실패: 지원하지 않는 형식입니다.");
      event.target.value = "";
      return;
    }

    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }

    const objectUrl = URL.createObjectURL(file);
    previewObjectUrlRef.current = objectUrl;
    setPreviewAudioSrc(objectUrl);
    setPreviewAudioLabel(file.name);
    setPreviewAudioMode("file");
    setPreviewAudioReconnectNeeded(false);
    setPreviewAudioStatus("loading");
    setPreviewAudioError("");
    setPreviewAudioDurationMs(null);
    setRecentAudioMeta({
      mode: "file",
      fileName: file.name,
      mimeType: file.type || null,
      size: file.size,
      durationMs: null,
    });
    if (reconnectExpectedFileName) {
      setToast(
        reconnectExpectedFileName === file.name
          ? `이전 오디오를 다시 연결했습니다: ${file.name}`
          : `이전 오디오와 다른 파일로 연결했습니다: ${file.name}`,
      );
    } else {
      setToast(`오디오 파일을 불러왔습니다: ${file.name}`);
    }
    event.target.value = "";
  };

  const applyPreviewZoom = (rawValue: number) => {
    const nextZoom = normalizePreviewZoom(rawValue);
    setPreviewZoom(nextZoom);
    setPreviewZoomDraft(nextZoom.toFixed(1));
  };

  const commitPreviewZoomDraft = () => {
    const parsed = Number(previewZoomDraft.trim());
    if (!Number.isFinite(parsed)) {
      setPreviewZoomDraft(previewZoom.toFixed(1));
      return;
    }
    applyPreviewZoom(parsed);
  };

  const openPreviewScreen = (autoplay = false) => {
    setAppSection("workspace");
    setToolSheetOpen(false);
    clearAllPreviewLaneFlash();
    if (!previewLongValidation.isValid) {
      const firstIssue = previewLongValidation.issues[0];
      setSelectedDivisionIdx(firstIssue.divIdx);
      setSelectedRow({ divIdx: firstIssue.divIdx, rowIdx: firstIssue.rowIdx });
      setCurrentView("editor");
      previewPlaybackRequestIdRef.current += 1;
      setIsPlaying(false);
      setToast(`프리뷰를 열 수 없습니다. ${actualRowLabel(divisions, firstIssue.divIdx, firstIssue.rowIdx)} ${CELL_LABELS[firstIssue.colIdx]}열: ${firstIssue.message}`);
      return;
    }

    const startTime = currentAnchorTimeMs;
    const startScrollBeat = getPreviewScrollBeatByTime(previewTimingData.divisionSpans, startTime);
    setPreviewAnchorTimeMs(startTime);
    setPreviewCursorTimeMs(startTime);
    setPreviewCursorScrollBeat(startScrollBeat);
    syncPreviewHitsoundPointer(startTime);
    writePreviewAudioTime(startTime);
    previewPlaybackUsesAudioClockRef.current = false;
    previewPlaybackBaseRef.current = startTime;
    previewPlaybackStartedAtRef.current = null;
    setCurrentView("preview");

    if (autoplay) {
      void startPreviewPlaybackSynced(startTime, "플레이어 재생을 시작했습니다.");
      return;
    }

    previewPlaybackRequestIdRef.current += 1;
    setIsPlaying(false);
    setToast("플레이어 화면을 열었습니다.");
  };

  const openEditorScreen = () => {
    setAppSection("workspace");
    setToolSheetOpen(false);
    clearAllPreviewLaneFlash();
    const syncTimeMs = previewCursorTimeMs;
    const nearestRow = resolveEditorSyncRowByTime(previewTimingData, syncTimeMs);

    previewPlaybackRequestIdRef.current += 1;
    previewPlaybackUsesAudioClockRef.current = false;
    previewPlaybackBaseRef.current = syncTimeMs;
    previewPlaybackStartedAtRef.current = null;
    setIsPlaying(false);
    previewAudioRef.current?.pause();
    setCurrentView("editor");

    if (!nearestRow) {
      setPendingEditorSyncTarget(null);
      setToast("에디터 화면으로 돌아왔습니다.");
      return;
    }

    setSelectedDivisionIdx(nearestRow.divIdx);
    setSelectedRow(nearestRow);
    setPendingEditorSyncTarget({ ...nearestRow, timeMs: syncTimeMs });
    setToast(`재생 시점 ${formatPreviewTimeMs(syncTimeMs)} ms에 가장 가까운 실제 행으로 돌아왔습니다.`);
  };

  const togglePreviewPlayback = () => {
    if (currentView !== "preview") {
      openPreviewScreen(true);
      return;
    }

    if (isPlaying) {
      previewPlaybackRequestIdRef.current += 1;
      previewPlaybackUsesAudioClockRef.current = false;
      previewPlaybackBaseRef.current = previewCursorTimeMs;
      previewPlaybackStartedAtRef.current = null;
      setIsPlaying(false);
      previewAudioRef.current?.pause();
      setToast("플레이어를 일시정지했습니다.");
      return;
    }

    const restartTime =
      previewCursorTimeMs >= previewTimingData.chartEndTimeMs + PREVIEW_END_PADDING_MS
        ? previewAnchorTimeMs
        : previewCursorTimeMs;

    void startPreviewPlaybackSynced(restartTime, "플레이어 재생을 시작했습니다.");
  };

  useEffect(() => {
    if (currentView !== "preview" || !isPlaying) return;

    const baseTimeMs = previewPlaybackBaseRef.current;
    const startedAt = previewPlaybackStartedAtRef.current ?? performance.now();
    previewPlaybackStartedAtRef.current = startedAt;
    let rafId = 0;

    const playHitsoundsUntil = (targetTimeMs: number) => {
      for (let index = previewLastHitsoundRowIndexRef.current + 1; index < previewTimingData.rowEvents.length; index += 1) {
        const row = previewTimingData.rowEvents[index];
        if (!row.hasHitsound) continue;
        if (row.startTimeMs <= targetTimeMs + 0.001) {
          playPreviewHitsound();
          triggerPreviewLaneFeedback(row.laneCells);
          previewLastHitsoundRowIndexRef.current = index;
          continue;
        }
        break;
      }
    };

    const stopPlaybackAt = (targetTimeMs: number, message: string, pauseAudio: boolean) => {
      playHitsoundsUntil(targetTimeMs);
      setPreviewCursorTimeMs(targetTimeMs);
      setPreviewCursorScrollBeat(getPreviewScrollBeatByTime(previewTimingData.divisionSpans, targetTimeMs));
      previewPlaybackRequestIdRef.current += 1;
      previewPlaybackUsesAudioClockRef.current = false;
      previewPlaybackBaseRef.current = targetTimeMs;
      previewPlaybackStartedAtRef.current = null;
      if (pauseAudio) previewAudioRef.current?.pause();
      setIsPlaying(false);
      setToast(message);
    };

    const tick = (now: number) => {
      const previewAudio = previewAudioRef.current;
      const audioClockTimeMs = readPreviewAudioClockTime();
      const usingAudioClock = audioClockTimeMs !== null;
      const cappedEndTime = previewTimingData.chartEndTimeMs + PREVIEW_END_PADDING_MS;

      if (usingAudioClock && previewAudio) {
        if (previewAudio.ended) {
          stopPlaybackAt(Math.min(cappedEndTime, Math.max(previewMinTimeMs, previewAudio.currentTime * 1000)), "오디오 재생이 끝나 프리뷰를 멈췄습니다.", false);
          return;
        }

        const nextTimeMs = Math.max(previewMinTimeMs, Math.min(cappedEndTime, audioClockTimeMs ?? 0));
        if (nextTimeMs >= cappedEndTime) {
          stopPlaybackAt(cappedEndTime, "차트 끝에 도달해 재생을 멈췄습니다.", true);
          return;
        }

        playHitsoundsUntil(nextTimeMs);
        setPreviewCursorTimeMs(nextTimeMs);
        setPreviewCursorScrollBeat(getPreviewScrollBeatByTime(previewTimingData.divisionSpans, nextTimeMs));
        rafId = requestAnimationFrame(tick);
        return;
      }

      const elapsedMs = now - startedAt;
      const nextTimeMs = baseTimeMs + elapsedMs;
      if (nextTimeMs >= cappedEndTime) {
        stopPlaybackAt(cappedEndTime, "차트 끝에 도달해 재생을 멈췄습니다.", true);
        return;
      }

      playHitsoundsUntil(nextTimeMs);
      setPreviewCursorTimeMs(nextTimeMs);
      setPreviewCursorScrollBeat(getPreviewScrollBeatByTime(previewTimingData.divisionSpans, nextTimeMs));
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [currentView, isPlaying, previewAudioSrc, previewMinTimeMs, previewTimingData.chartEndTimeMs, previewTimingData.divisionSpans, previewTimingData.rowEvents]);

  const previewTapEventsByLane = useMemo(() => {
    const grouped = Array.from({ length: CELL_LABELS.length }, () => [] as Array<PreviewTapEvent & { y: number }>);
    previewTimingData.tapEvents.forEach((event) => {
      const y = previewJudgeLineY + (event.scrollBeatValue - previewCursorScrollBeat) * previewBeatToPx;
      if (y >= -previewNoteSize && y <= previewViewportHeight + previewNoteSize) {
        grouped[event.colIdx].push({ ...event, y });
      }
    });
    return grouped;
  }, [previewCursorScrollBeat, previewJudgeLineY, previewBeatToPx, previewTimingData.tapEvents]);

  const previewHoldEventsByLane = useMemo(() => {
    const grouped = Array.from(
      { length: CELL_LABELS.length },
      () => [] as Array<PreviewHoldEvent & { startY: number; endY: number; bodyTop: number; bodyHeight: number }>,
    );
    previewTimingData.holdEvents.forEach((event) => {
      const startY = previewJudgeLineY + (event.startScrollBeat - previewCursorScrollBeat) * previewBeatToPx;
      const endY = previewJudgeLineY + (event.endScrollBeat - previewCursorScrollBeat) * previewBeatToPx;
      const bodyTop = Math.min(startY, endY);
      const bodyHeight = Math.max(2, Math.abs(endY - startY));
      if (bodyTop <= previewViewportHeight + previewNoteSize && bodyTop + bodyHeight >= -previewNoteSize) {
        grouped[event.colIdx].push({ ...event, startY, endY, bodyTop, bodyHeight });
      }
    });
    return grouped;
  }, [previewCursorScrollBeat, previewJudgeLineY, previewBeatToPx, previewTimingData.holdEvents]);

  const previewLaneHoldActive = useMemo(() => {
    const active = Array(CELL_LABELS.length).fill(false) as boolean[];
    if (currentView !== "preview") return active;

    previewTimingData.holdEvents.forEach((event) => {
      if (previewCursorTimeMs >= event.startTimeMs && previewCursorTimeMs <= event.endTimeMs + 0.001) {
        active[event.colIdx] = true;
      }
    });

    return active;
  }, [currentView, previewCursorTimeMs, previewTimingData.holdEvents]);

  const previewBeatPulseStrength = useMemo(
    () => (currentView === "preview" ? getPreviewBeatPulseStrength(previewTimingData.divisionSpans, previewCursorTimeMs, PREVIEW_BEAT_PULSE_WINDOW_MS) : 0),
    [currentView, previewCursorTimeMs, previewTimingData.divisionSpans],
  );

  const effectiveExpandedGroupKeys = useMemo(() => {
    const keys = new Set(manualExpandedGroups);
    const refs: RowSelection[] = [];
    if (selectedRow) refs.push(selectedRow);
    multiSelectedRows.forEach((row) => refs.push(row));
    refs.forEach((ref) => {
      const info = getGroupInfo(divisions[ref.divIdx], ref.rowIdx, zoomLevel);
      if (info?.isHidden) keys.add(info.groupKey);
    });
    return keys;
  }, [manualExpandedGroups, selectedRow, multiSelectedRows, divisions, zoomLevel]);

  const displayRows = useMemo<DisplayRow[]>(() => {
    const rendered: DisplayRow[] = [];

    divisions.forEach((div, divIdx) => {
      const rowsPerBeat = div.split;
      const rowsPerMeasureLocal = div.beat * div.split;
      const firstRowTiming = previewTimingData.rowTimeMap[refKey(divIdx, 0)];
      const divisionStartTimeMs = firstRowTiming?.startTimeMs ?? 0;
      const rowDurationMs = firstRowTiming?.rowDurationMs ?? getMsPerBeat(div.bpm) / div.split;
      const beatDurationMs = rowDurationMs * div.split;

      if (usesBoundaryGhost(div, zoomLevel)) {
        for (let beatStart = 0; beatStart < div.rows.length; beatStart += rowsPerBeat) {
          const beatLength = Math.min(rowsPerBeat, div.rows.length - beatStart);
          const representativeRowIdx = beatStart;
          const hiddenRows = Array.from({ length: Math.max(0, beatLength - 1) }, (_, i) => beatStart + i + 1);
          const groupKey = `${div.id}:${beatStart}:boundary:z${zoomLevel}`;
          const isOpen = effectiveExpandedGroupKeys.has(groupKey);

          rendered.push({
            kind: "actual",
            displayKey: `actual:${divIdx}:${representativeRowIdx}`,
            divIdx,
            rowIdx: representativeRowIdx,
            cells: div.rows[representativeRowIdx],
            label: actualRowLabel(divisions, divIdx, representativeRowIdx),
            isMeasureStart: representativeRowIdx % rowsPerMeasureLocal === 0,
            isRepresentative: hiddenRows.length > 0,
            isExpandedHidden: false,
            isOpen,
            hiddenCount: hiddenRows.length,
            hiddenMarkers: hiddenRows.length > 0 ? buildHiddenMarkers(div.rows, hiddenRows) : undefined,
            groupKey,
            startTimeMs: previewTimingData.rowTimeMap[refKey(divIdx, representativeRowIdx)]?.startTimeMs ?? divisionStartTimeMs,
            endTimeMs: previewTimingData.rowTimeMap[refKey(divIdx, representativeRowIdx)]?.endTimeMs ?? divisionStartTimeMs + rowDurationMs,
            anchorTimeMs: previewTimingData.rowTimeMap[refKey(divIdx, representativeRowIdx)]?.anchorTimeMs ?? divisionStartTimeMs,
          });

          if (isOpen) {
            hiddenRows.forEach((rowIdx) => {
              rendered.push({
                kind: "actual",
                displayKey: `actual:${divIdx}:${rowIdx}`,
                divIdx,
                rowIdx,
                cells: div.rows[rowIdx],
                label: actualRowLabel(divisions, divIdx, rowIdx),
                isMeasureStart: rowIdx % rowsPerMeasureLocal === 0,
                isRepresentative: false,
                isExpandedHidden: true,
                isOpen: false,
                hiddenCount: 0,
                groupKey,
                startTimeMs: previewTimingData.rowTimeMap[refKey(divIdx, rowIdx)]?.startTimeMs ?? divisionStartTimeMs,
                endTimeMs: previewTimingData.rowTimeMap[refKey(divIdx, rowIdx)]?.endTimeMs ?? divisionStartTimeMs + rowDurationMs,
                anchorTimeMs: previewTimingData.rowTimeMap[refKey(divIdx, rowIdx)]?.anchorTimeMs ?? divisionStartTimeMs,
              });
            });
          } else {
            for (const boundaryIndex of getVisibleBoundaryIndices(div.split, beatLength, zoomLevel)) {
              rendered.push({
                kind: "ghost",
                displayKey: `ghost-boundary:${divIdx}:${beatStart}:${boundaryIndex}`,
                divIdx,
                cells: buildBoundaryGhostCells(div.rows, beatStart, beatLength, boundaryIndex, zoomLevel),
                isMeasureStart: false,
                ghostType: "boundary",
                label: formatFractionLabel(boundaryIndex, zoomLevel),
                startTimeMs: divisionStartTimeMs + beatStart * rowDurationMs + (boundaryIndex / zoomLevel) * beatDurationMs,
                endTimeMs: divisionStartTimeMs + beatStart * rowDurationMs + (boundaryIndex / zoomLevel) * beatDurationMs,
                anchorTimeMs: divisionStartTimeMs + beatStart * rowDurationMs + (boundaryIndex / zoomLevel) * beatDurationMs,
              });
            }
          }
        }
        return;
      }

      if (zoomLevel < div.split) {
        for (let beatStart = 0; beatStart < div.rows.length; beatStart += rowsPerBeat) {
          const beatLength = Math.min(rowsPerBeat, div.rows.length - beatStart);
          for (let groupIndex = 0; groupIndex < zoomLevel; groupIndex += 1) {
            const groupRows: number[] = [];
            for (let offset = 0; offset < beatLength; offset += 1) {
              if (Math.floor((offset * zoomLevel) / div.split) === groupIndex) {
                groupRows.push(beatStart + offset);
              }
            }
            if (groupRows.length === 0) continue;
            const representativeRowIdx = groupRows[0];
            const hiddenRows = groupRows.slice(1);
            const groupKey = `${div.id}:${beatStart}:${groupIndex}:z${zoomLevel}`;
            const isOpen = effectiveExpandedGroupKeys.has(groupKey);

            rendered.push({
              kind: "actual",
              displayKey: `actual:${divIdx}:${representativeRowIdx}`,
              divIdx,
              rowIdx: representativeRowIdx,
              cells: div.rows[representativeRowIdx],
              label: actualRowLabel(divisions, divIdx, representativeRowIdx),
              isMeasureStart: representativeRowIdx % rowsPerMeasureLocal === 0,
              isRepresentative: hiddenRows.length > 0,
              isExpandedHidden: false,
              isOpen,
              hiddenCount: hiddenRows.length,
              hiddenMarkers: hiddenRows.length > 0 ? buildHiddenMarkers(div.rows, hiddenRows) : undefined,
              groupKey,
              startTimeMs: previewTimingData.rowTimeMap[refKey(divIdx, representativeRowIdx)]?.startTimeMs ?? divisionStartTimeMs,
              endTimeMs: previewTimingData.rowTimeMap[refKey(divIdx, representativeRowIdx)]?.endTimeMs ?? divisionStartTimeMs + rowDurationMs,
              anchorTimeMs: previewTimingData.rowTimeMap[refKey(divIdx, representativeRowIdx)]?.anchorTimeMs ?? divisionStartTimeMs,
            });

            if (isOpen) {
              hiddenRows.forEach((rowIdx) => {
                rendered.push({
                  kind: "actual",
                  displayKey: `actual:${divIdx}:${rowIdx}`,
                  divIdx,
                  rowIdx,
                  cells: div.rows[rowIdx],
                  label: actualRowLabel(divisions, divIdx, rowIdx),
                  isMeasureStart: rowIdx % rowsPerMeasureLocal === 0,
                  isRepresentative: false,
                  isExpandedHidden: true,
                  isOpen: false,
                  hiddenCount: 0,
                  groupKey,
                  startTimeMs: previewTimingData.rowTimeMap[refKey(divIdx, rowIdx)]?.startTimeMs ?? divisionStartTimeMs,
                  endTimeMs: previewTimingData.rowTimeMap[refKey(divIdx, rowIdx)]?.endTimeMs ?? divisionStartTimeMs + rowDurationMs,
                  anchorTimeMs: previewTimingData.rowTimeMap[refKey(divIdx, rowIdx)]?.anchorTimeMs ?? divisionStartTimeMs,
                });
              });
            }
          }
        }
        return;
      }

      const totalDisplaySlots = Math.ceil((div.rows.length * zoomLevel) / div.split);
      const actualSlotMap = new Map<number, number>();
      div.rows.forEach((_, rowIdx) => {
        actualSlotMap.set(Math.floor((rowIdx * zoomLevel) / div.split), rowIdx);
      });

      for (let slot = 0; slot < totalDisplaySlots; slot += 1) {
        const actualRowIdx = actualSlotMap.get(slot);
        if (actualRowIdx !== undefined) {
          rendered.push({
            kind: "actual",
            displayKey: `actual:${divIdx}:${actualRowIdx}`,
            divIdx,
            rowIdx: actualRowIdx,
            cells: div.rows[actualRowIdx],
            label: actualRowLabel(divisions, divIdx, actualRowIdx),
            isMeasureStart: actualRowIdx % rowsPerMeasureLocal === 0,
            isRepresentative: false,
            isExpandedHidden: false,
            isOpen: false,
            hiddenCount: 0,
            startTimeMs: previewTimingData.rowTimeMap[refKey(divIdx, actualRowIdx)]?.startTimeMs ?? divisionStartTimeMs,
            endTimeMs: previewTimingData.rowTimeMap[refKey(divIdx, actualRowIdx)]?.endTimeMs ?? divisionStartTimeMs + rowDurationMs,
            anchorTimeMs: previewTimingData.rowTimeMap[refKey(divIdx, actualRowIdx)]?.anchorTimeMs ?? divisionStartTimeMs,
          });
          continue;
        }

        let prevActualRowIdx: number | null = null;
        let nextActualRowIdx: number | null = null;
        for (let i = slot - 1; i >= 0; i -= 1) {
          const found = actualSlotMap.get(i);
          if (found !== undefined) {
            prevActualRowIdx = found;
            break;
          }
        }
        for (let i = slot + 1; i < totalDisplaySlots; i += 1) {
          const found = actualSlotMap.get(i);
          if (found !== undefined) {
            nextActualRowIdx = found;
            break;
          }
        }

        const ghostCells: Cell[] = CELL_LABELS.map((_, colIdx) => {
          const prev = prevActualRowIdx !== null ? div.rows[prevActualRowIdx][colIdx] : ".";
          const next = nextActualRowIdx !== null ? div.rows[nextActualRowIdx][colIdx] : ".";
          if (prev === "M" || prev === "H") return "H";
          if ((next === "H" || next === "W") && prev !== "X") return "H";
          return ".";
        }) as Cell[];

        rendered.push({
          kind: "ghost",
          displayKey: `ghost-interpolation:${divIdx}:${slot}`,
          divIdx,
          cells: ghostCells,
          isMeasureStart: slot % zoomLevel === 0,
          ghostType: "interpolation",
          label: "···",
          startTimeMs: divisionStartTimeMs + (slot / zoomLevel) * beatDurationMs,
          endTimeMs: divisionStartTimeMs + (slot / zoomLevel) * beatDurationMs,
          anchorTimeMs: divisionStartTimeMs + (slot / zoomLevel) * beatDurationMs,
        });
      }
    });

    return rendered;
  }, [divisions, zoomLevel, effectiveExpandedGroupKeys, previewTimingData.rowTimeMap]);

  useEffect(() => {
    if (currentView !== "editor") return;

    const updateEditorAnchorTime = () => {
      const container = editorScrollRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const judgeLineY = containerRect.top + container.clientHeight * EDITOR_JUDGE_LINE_RATIO;
      let nearestTime = previewTimingData.rowEvents[0]?.anchorTimeMs ?? 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      displayRows.forEach((item) => {
        const element = editorRowRefs.current[item.displayKey];
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const distance = Math.abs(centerY - judgeLineY);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestTime = item.anchorTimeMs;
        }
      });

      setEditorAnchorTimeMs((prev) => (Math.abs(prev - nearestTime) < 0.001 ? prev : nearestTime));
    };

    updateEditorAnchorTime();
    const container = editorScrollRef.current;
    if (!container) return;
    container.addEventListener("scroll", updateEditorAnchorTime, { passive: true });
    window.addEventListener("resize", updateEditorAnchorTime);
    return () => {
      container.removeEventListener("scroll", updateEditorAnchorTime);
      window.removeEventListener("resize", updateEditorAnchorTime);
    };
  }, [currentView, displayRows, previewTimingData.rowEvents]);

  useEffect(() => {
    if (currentView !== "editor" || !pendingEditorSyncTarget) return;

    const frameId = requestAnimationFrame(() => {
      const container = editorScrollRef.current;
      if (!container) return;

      const targetKey = `actual:${pendingEditorSyncTarget.divIdx}:${pendingEditorSyncTarget.rowIdx}`;
      let element = editorRowRefs.current[targetKey] ?? null;

      if (!element) {
        const nearestDisplayRow = findNearestDisplayRowByTime(displayRows, pendingEditorSyncTarget.timeMs);
        if (nearestDisplayRow) {
          element = editorRowRefs.current[nearestDisplayRow.displayKey] ?? null;
        }
      }

      if (!element) {
        setPendingEditorSyncTarget(null);
        return;
      }

      const judgeLineOffset = container.clientHeight * EDITOR_JUDGE_LINE_RATIO;
      const targetTop = element.offsetTop;
      const nextScrollTop = Math.max(0, targetTop - judgeLineOffset);
      container.scrollTo({ top: nextScrollTop, behavior: "auto" });
      setEditorAnchorTimeMs(pendingEditorSyncTarget.timeMs);
      setPendingEditorSyncTarget(null);
    });

    return () => cancelAnimationFrame(frameId);
  }, [currentView, pendingEditorSyncTarget, displayRows]);

  const getOrderedSelectedRows = (): RowSelection[] => {
    if (selectedCellRange || rangeAnchor?.kind === "cell") return [];
    const selectedKeys = new Set(
      (multiSelectedRows.length > 0 ? multiSelectedRows : selectedRow ? [selectedRow] : []).map((row) => refKey(row.divIdx, row.rowIdx)),
    );
    if (selectedKeys.size === 0) return [];
    return buildFlatRowRefs(divisions).filter((row) => selectedKeys.has(refKey(row.divIdx, row.rowIdx)));
  };

  const collapseGroup = (item: DisplayActualRow) => {
    if (!item.groupKey) return;
    const info = getGroupInfo(divisions[item.divIdx], item.rowIdx, zoomLevel);
    const groupRows = info?.rows ?? [item.rowIdx];
    const rowSet = new Set(groupRows);
    setManualExpandedGroups((prev) => prev.filter((key) => key !== item.groupKey));
    setSelectedRow((prev) => (prev && prev.divIdx === item.divIdx && rowSet.has(prev.rowIdx) ? null : prev));
    setMultiSelectedRows((prev) => prev.filter((row) => !(row.divIdx === item.divIdx && rowSet.has(row.rowIdx))));
    setPendingLongStart((prev) => (prev && prev.divIdx === item.divIdx && rowSet.has(prev.rowIdx) ? null : prev));
    setToast(`대표 행 아래 펼쳐진 ${Math.max(0, groupRows.length - 1)}개 행을 다시 숨겼습니다.`);
  };

  const collapseAll = () => {
    setManualExpandedGroups([]);
    clearAllSelection();
    setToast("모든 펼침을 접고 선택을 해제했습니다.");
  };

  const currentPointerText = pendingLongStart && isTemporaryLongStart
    ? `임시 롱모드: 시작 ${CELL_LABELS[pendingLongStart.colIdx]} / ${pendingLongStart.rowIdx + 1}행 · 끝점을 선택하거나 모드를 바꾸세요.`
    : pendingLongStart
      ? `시작: ${CELL_LABELS[pendingLongStart.colIdx]} / ${pendingLongStart.rowIdx + 1}행 · 디비전이 달라도 같은 열이면 끝점으로 선택할 수 있습니다`
      : mode === "note"
        ? "빈 칸 탭 = X 생성 · 기존 노트 탭 = 삭제"
        : mode === "long"
          ? "롱노트 시작점을 선택하세요"
          : selectTool === "row_single"
            ? "행 단일 선택: 행 라벨이나 셀을 눌러 한 행만 선택합니다. 좌우반전은 선택된 행 전체에 적용됩니다."
            : rangeAnchor?.kind === "row"
              ? "행 범위 선택 중: 끝 행도 같은 종류(행 라벨)로 선택하세요. 다른 종류를 누르면 취소됩니다. 디비전을 넘어 연속 행을 선택할 수 있습니다."
              : rangeAnchor?.kind === "cell"
                ? "셀 범위 선택 중: 끝 셀도 같은 종류(셀)로 선택하세요. 다른 종류를 누르면 취소됩니다. 디비전을 넘어 연속 행을 포함할 수 있으며, 좌우반전은 선택한 열 범위 내부에만 적용됩니다."
                : "범위 선택: 첫 클릭이 행 라벨이면 행 범위, 셀이면 셀 범위입니다. 다른 종류를 누르면 취소됩니다. 디비전을 넘어 연속 선택할 수 있고, 좌우반전은 현재 선택 종류에 맞춰 다르게 실행됩니다.";

  const selectedCountInCurrentDivision = multiSelectedRows.filter((r) => r.divIdx === selectedDivisionIdx).length;
  const selectedCellRangeSize = selectedCellRange
    ? `${selectedCellRange.totalRowCount}×${selectedCellRange.colEnd - selectedCellRange.colStart + 1}`
    : null;

  const handleEditorZoomChange = (nextZoom: ZoomLevel) => {
    if (nextZoom === zoomLevel) return;

    const anchorTimeMs = editorAnchorTimeMs || currentAnchorTimeMs;
    const nearestRow = resolveEditorSyncRowByTime(previewTimingData, anchorTimeMs)
      ?? selectedRow
      ?? { divIdx: selectedDivisionIdx, rowIdx: 0 };

    setZoomLevel(nextZoom);
    setPendingEditorSyncTarget({
      divIdx: nearestRow.divIdx,
      rowIdx: nearestRow.rowIdx,
      timeMs: anchorTimeMs,
    });
    setToast(`줌을 ${nextZoom}x로 변경했습니다.`);
  };

  const openResize = () => {
    setResizeDraft(String(divisions[selectedDivisionIdx].rows.length));
    setResizeOpen(true);
  };

  const openAdjustSplitBeat = () => {
    setAdjustDraft({ nextSplit: String(divisions[selectedDivisionIdx].split) });
    setPendingAdjustTarget(null);
    setAdjustWarningOpen(false);
    setAdjustOpen(true);
  };

  const commitAdjustSplitBeat = (targetSplit: number) => {
    pushUndoSnapshot();
    const next = cloneDivisions(divisions);
    next[selectedDivisionIdx] = adjustDivisionSplit(next[selectedDivisionIdx], targetSplit);
    setDivisions(next);
    setAdjustDraft({ nextSplit: String(targetSplit) });
    setAdjustOpen(false);
    setAdjustWarningOpen(false);
    setPendingAdjustTarget(null);
    setManualExpandedGroups([]);
    clearAllSelection();
    setToast(`Div ${selectedDivisionIdx + 1}의 Split을 ${targetSplit}(으)로 조정했습니다.`);
  };

  const applyAdjustSplitBeat = () => {
    const targetSplitRaw = Number(adjustDraft.nextSplit.trim());
    if (!Number.isFinite(targetSplitRaw) || !isIntegerLike(targetSplitRaw)) {
      setToast("새 Split은 정수여야 합니다.");
      return;
    }
    const targetSplit = Math.trunc(targetSplitRaw);
    if (targetSplit < 1 || targetSplit > 128) {
      setToast("새 Split은 1 이상 128 이하의 정수여야 합니다.");
      return;
    }
    const currentSplit = divisions[selectedDivisionIdx].split;
    if (targetSplit === currentSplit) {
      setAdjustOpen(false);
      setToast("Split이 같아서 변경할 내용이 없습니다.");
      return;
    }
    const rowCount = divisions[selectedDivisionIdx].rows.length;
    if (willAdjustSplitChangeDuration(rowCount, currentSplit, targetSplit)) {
      setPendingAdjustTarget(targetSplit);
      setAdjustWarningOpen(true);
      return;
    }
    commitAdjustSplitBeat(targetSplit);
  };

  const confirmAdjustSplitBeatWarning = () => {
    if (pendingAdjustTarget === null) return;
    commitAdjustSplitBeat(pendingAdjustTarget);
  };

  const openProperty = () => {
    const div = divisions[selectedDivisionIdx];
    setPropertyDraft({
      bpm: String(div.bpm),
      delay: formatRounded(div.delay, 5),
      beat: String(div.beat),
      split: String(div.split),
    });
    setDelayUnit("ms");
    setPropertyOpen(true);
  };

  const toggleDelayUnit = (nextUnit: DelayUnit) => {
    if (delayUnit === nextUnit) return;
    const bpmCandidate = Number(propertyDraft.bpm.trim());
    const bpmForConversion = Number.isFinite(bpmCandidate) && bpmCandidate > 0 ? bpmCandidate : divisions[selectedDivisionIdx].bpm;
    const currentDelay = Number(propertyDraft.delay.trim());
    setPropertyDraft((prev) => ({
      ...prev,
      delay: Number.isFinite(currentDelay)
        ? formatRounded(convertDelayValue(currentDelay, delayUnit, nextUnit, bpmForConversion), 5)
        : prev.delay,
    }));
    setDelayUnit(nextUnit);
  };

  const isRowSelected = (divIdx: number, rowIdx: number) =>
    multiSelectedRows.some((row) => row.divIdx === divIdx && row.rowIdx === rowIdx);

  const isCellRangeSelected = (divIdx: number, rowIdx: number, colIdx: number) => {
    if (!selectedCellRange) return false;
    const inRow = selectedCellRange.segments.some(
      (segment) => segment.divIdx === divIdx && rowIdx >= segment.rowStart && rowIdx <= segment.rowEnd,
    );
    return inRow && colIdx >= selectedCellRange.colStart && colIdx <= selectedCellRange.colEnd;
  };

  const isRangeAnchorCell = (divIdx: number, rowIdx: number, colIdx: number) =>
    rangeAnchor?.kind === "cell" && rangeAnchor.divIdx === divIdx && rangeAnchor.rowIdx === rowIdx && rangeAnchor.colIdx === colIdx;

  const clearSelectOnlyState = () => {
    setSelectedRow(null);
    setMultiSelectedRows([]);
    setSelectedCellRange(null);
    setRangeAnchor(null);
  };

  const clearCellLongPressTimer = () => {
    if (cellLongPressTimerRef.current !== null) {
      window.clearTimeout(cellLongPressTimerRef.current);
      cellLongPressTimerRef.current = null;
    }
  };

  const clearRowLongPressTimer = () => {
    if (rowLongPressTimerRef.current !== null) {
      window.clearTimeout(rowLongPressTimerRef.current);
      rowLongPressTimerRef.current = null;
    }
  };

  const beginTemporaryLongStart = (divIdx: number, rowIdx: number, colIdx: number) => {
    setSelectedDivisionIdx(divIdx);
    setSelectedRow({ divIdx, rowIdx });
    setMultiSelectedRows([]);
    setSelectedCellRange(null);
    setRangeAnchor(null);
    setPendingLongStart({ divIdx, rowIdx, colIdx });
    setIsTemporaryLongStart(true);
    suppressCellTapKeyRef.current = `${divIdx}:${rowIdx}:${colIdx}`;
    setToast(`임시 롱모드: ${CELL_LABELS[colIdx]} 열의 끝점을 선택하세요.`);
  };

  const handleCellPointerDown = (divIdx: number, rowIdx: number, colIdx: number, event: React.PointerEvent<HTMLButtonElement>) => {
    if (mode !== "note" || pendingLongStart) return;
    clearCellLongPressTimer();
    cellLongPressTargetRef.current = {
      divIdx,
      rowIdx,
      colIdx,
      startX: event.clientX,
      startY: event.clientY,
    };
    cellLongPressTimerRef.current = window.setTimeout(() => {
      const target = cellLongPressTargetRef.current;
      if (!target) return;
      beginTemporaryLongStart(target.divIdx, target.rowIdx, target.colIdx);
      cellLongPressTargetRef.current = null;
      cellLongPressTimerRef.current = null;
    }, TEMP_LONG_PRESS_MS);
  };

  const handleCellPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!cellLongPressTargetRef.current) return;
    const deltaX = event.clientX - cellLongPressTargetRef.current.startX;
    const deltaY = event.clientY - cellLongPressTargetRef.current.startY;
    if (Math.hypot(deltaX, deltaY) > TEMP_LONG_MOVE_TOLERANCE) {
      clearCellLongPressTimer();
      cellLongPressTargetRef.current = null;
    }
  };

  const handleCellPointerEnd = () => {
    clearCellLongPressTimer();
    cellLongPressTargetRef.current = null;
  };

  const openRowDivisionActions = (divIdx: number, rowIdx: number) => {
    setSelectedDivisionIdx(divIdx);
    setSelectedRow({ divIdx, rowIdx });
    setMultiSelectedRows([]);
    setSelectedCellRange(null);
    setRangeAnchor(null);
    setPendingLongStart(null);
    setIsTemporaryLongStart(false);
    setRowDivisionSheetOpen(true);
    setToast(`Div ${divIdx + 1}의 ${rowIdx + 1}행에서 Division 작업을 엽니다.`);
  };

  const handleRowPointerDown = (item: DisplayActualRow, event: React.PointerEvent<HTMLButtonElement>) => {
    clearRowLongPressTimer();
    rowLongPressTargetRef.current = {
      divIdx: item.divIdx,
      rowIdx: item.rowIdx,
      startX: event.clientX,
      startY: event.clientY,
    };
    rowLongPressTimerRef.current = window.setTimeout(() => {
      const target = rowLongPressTargetRef.current;
      if (!target) return;
      suppressRowTapKeyRef.current = `${target.divIdx}:${target.rowIdx}`;
      openRowDivisionActions(target.divIdx, target.rowIdx);
      rowLongPressTargetRef.current = null;
      rowLongPressTimerRef.current = null;
    }, ROW_LONG_PRESS_MS);
  };

  const handleRowPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!rowLongPressTargetRef.current) return;
    const deltaX = event.clientX - rowLongPressTargetRef.current.startX;
    const deltaY = event.clientY - rowLongPressTargetRef.current.startY;
    if (Math.hypot(deltaX, deltaY) > ROW_LONG_MOVE_TOLERANCE) {
      clearRowLongPressTimer();
      rowLongPressTargetRef.current = null;
    }
  };

  const handleRowPointerEnd = () => {
    clearRowLongPressTimer();
    rowLongPressTargetRef.current = null;
  };

  const handleActualRowTap = (item: DisplayActualRow) => {
    const tapKey = `${item.divIdx}:${item.rowIdx}`;
    if (suppressRowTapKeyRef.current === tapKey) {
      suppressRowTapKeyRef.current = null;
      return;
    }
    setSelectedDivisionIdx(item.divIdx);
    setSelectedRow({ divIdx: item.divIdx, rowIdx: item.rowIdx });

    if (item.isRepresentative && item.groupKey) {
      setManualExpandedGroups((prev) => (prev.includes(item.groupKey!) ? prev : [...prev, item.groupKey!]));
    }

    if (mode !== "select") {
      setMultiSelectedRows([]);
      setSelectedCellRange(null);
      setRangeAnchor(null);
      setToast(
        pendingLongStart
          ? `Div ${item.divIdx + 1}의 ${item.rowIdx + 1}행을 선택했습니다. 롱노트 시작점은 유지됩니다.`
          : `Div ${item.divIdx + 1}의 ${item.rowIdx + 1}행을 선택했습니다.`,
      );
      return;
    }

    if (selectTool === "row_single") {
      setMultiSelectedRows([]);
      setSelectedCellRange(null);
      setRangeAnchor(null);
      setToast(`행 단일 선택: Div ${item.divIdx + 1}의 ${item.rowIdx + 1}행을 선택했습니다.`);
      return;
    }

    if (!rangeAnchor) {
      setRangeAnchor({ kind: "row", divIdx: item.divIdx, rowIdx: item.rowIdx });
      setMultiSelectedRows([]);
      setSelectedCellRange(null);
      setToast(`행 범위 시작점을 ${actualRowLabel(divisions, item.divIdx, item.rowIdx)}에 설정했습니다.`);
      return;
    }

    if (rangeAnchor.kind !== "row") {
      clearSelectOnlyState();
      setToast("셀 범위 선택이 취소되었습니다. 시작점과 같은 종류만 끝점으로 선택할 수 있습니다.");
      return;
    }

    const rows = getRowSelectionsInRange(
      divisions,
      { divIdx: rangeAnchor.divIdx, rowIdx: rangeAnchor.rowIdx },
      { divIdx: item.divIdx, rowIdx: item.rowIdx },
    );
    const firstRow = rows[0] ?? { divIdx: item.divIdx, rowIdx: item.rowIdx };
    setSelectedRow(firstRow);
    setMultiSelectedRows(rows);
    setSelectedCellRange(null);
    setRangeAnchor(null);
    setToast(`${rows.length}개 행을 범위 선택했습니다.`);
  };

  const handleCellTap = (divIdx: number, rowIdx: number, colIdx: number) => {
    const tapKey = `${divIdx}:${rowIdx}:${colIdx}`;
    if (suppressCellTapKeyRef.current === tapKey) {
      suppressCellTapKeyRef.current = null;
      return;
    }

    setSelectedDivisionIdx(divIdx);
    const value = divisions[divIdx].rows[rowIdx][colIdx];
    const effectiveLongMode = mode === "long" || isTemporaryLongStart;

    if (mode === "note" && !isTemporaryLongStart) {
      if (value === ".") {
        pushUndoSnapshot();
        const next = cloneDivisions(divisions);
        next[divIdx].rows[rowIdx][colIdx] = "X";
        setDivisions(next);
        setToast("일반 노트를 배치했습니다.");
      } else {
        pushUndoSnapshot();
        setDivisions(deleteConnectedAt(divisions, divIdx, rowIdx, colIdx));
        setToast("노트를 삭제했습니다.");
      }
      return;
    }

    if (effectiveLongMode) {
      if (!pendingLongStart) {
        setPendingLongStart({ divIdx, rowIdx, colIdx });
        setIsTemporaryLongStart(false);
        setToast(`시작점을 선택했습니다. 같은 열(${CELL_LABELS[colIdx]})에서 끝점을 고르세요.`);
        return;
      }
      if (pendingLongStart.colIdx !== colIdx) {
        const wasTemporary = isTemporaryLongStart;
        setPendingLongStart(null);
        setIsTemporaryLongStart(false);
        setToast(wasTemporary ? "임시 롱모드가 취소되었습니다." : "다른 열을 눌러 롱노트 생성이 취소되었습니다.");
        return;
      }
      if (pendingLongStart.divIdx === divIdx && pendingLongStart.rowIdx === rowIdx) {
        const wasTemporary = isTemporaryLongStart;
        setPendingLongStart(null);
        setIsTemporaryLongStart(false);
        setToast(wasTemporary ? "임시 롱모드를 취소했습니다." : "같은 칸을 다시 눌러 롱노트 생성이 취소되었습니다.");
        return;
      }
      pushUndoSnapshot();
      const { next, overwritten } = placeLongWithOverwrite(
        divisions,
        { divIdx: pendingLongStart.divIdx, rowIdx: pendingLongStart.rowIdx },
        { divIdx, rowIdx },
        colIdx,
      );
      setDivisions(next);
      setPendingLongStart(null);
      setIsTemporaryLongStart(false);
      setToast(overwritten ? "기존 노트를 덮어쓰며 롱노트를 생성했습니다." : "롱노트를 생성했습니다.");
      return;
    }

    if (selectTool === "row_single") {
      setSelectedRow({ divIdx, rowIdx });
      setMultiSelectedRows([]);
      setSelectedCellRange(null);
      setRangeAnchor(null);
      setToast(`행 단일 선택: Div ${divIdx + 1}의 ${rowIdx + 1}행을 선택했습니다.`);
      return;
    }

    if (!rangeAnchor) {
      setSelectedRow({ divIdx, rowIdx });
      setMultiSelectedRows([]);
      setSelectedCellRange(null);
      setRangeAnchor({ kind: "cell", divIdx, rowIdx, colIdx });
      setToast(`셀 범위 시작점을 ${actualRowLabel(divisions, divIdx, rowIdx)} ${CELL_LABELS[colIdx]}열에 설정했습니다.`);
      return;
    }

    if (rangeAnchor.kind !== "cell") {
      clearSelectOnlyState();
      setToast("행 범위 선택이 취소되었습니다. 시작점과 같은 종류만 끝점으로 선택할 수 있습니다.");
      return;
    }

    const selection = buildCellRangeSelection(divisions, rangeAnchor, { kind: "cell", divIdx, rowIdx, colIdx });
    setSelectedRow(selection.rowStartRef);
    setMultiSelectedRows([]);
    setSelectedCellRange(selection);
    setRangeAnchor(null);
    setToast(`${selection.totalRowCount}행 × ${selection.colEnd - selection.colStart + 1}열 셀 범위를 선택했습니다.`);
  };

  const selectWholeDivision = () => {
    const rows = divisions[selectedDivisionIdx].rows.map((_, rowIdx) => ({ divIdx: selectedDivisionIdx, rowIdx }));
    setMode("select");
    setSelectTool("range");
    setPendingLongStart(null);
    setSelectedRow({ divIdx: selectedDivisionIdx, rowIdx: 0 });
    setSelectedCellRange(null);
    setRangeAnchor(null);
    setMultiSelectedRows(rows);
    setToast(`Div ${selectedDivisionIdx + 1}의 전체 ${rows.length}행을 선택했습니다.`);
  };

  const splitHere = () => {
    if (!selectedRow || selectedRow.divIdx !== selectedDivisionIdx) {
      setToast("먼저 한 행을 선택하세요.");
      return;
    }
    const div = divisions[selectedDivisionIdx];
    const splitIndex = selectedRow.rowIdx;
    if (splitIndex <= 0 || splitIndex >= div.rows.length) {
      setToast("첫 행에서는 분할할 수 없습니다.");
      return;
    }
    pushUndoSnapshot();
    const next = cloneDivisions(divisions);
    const current = next[selectedDivisionIdx];
    const upperRows = current.rows.slice(0, splitIndex);
    const lowerRows = current.rows.slice(splitIndex);
    current.rows = upperRows;
    const newDivision: Division = {
      ...current,
      id: `${current.id}-split-${Date.now()}`,
      delay: 0,
      rows: lowerRows,
    };
    next.splice(selectedDivisionIdx + 1, 0, newDivision);
    setDivisions(next);
    setSelectedDivisionIdx(selectedDivisionIdx + 1);
    setSelectedRow({ divIdx: selectedDivisionIdx + 1, rowIdx: 0 });
    setMultiSelectedRows([]);
    setToast("선택한 행에서 Division을 분할했습니다.");
  };

  const cleanDivisionNotes = () => {
    pushUndoSnapshot();
    const next = cloneDivisions(divisions);
    next[selectedDivisionIdx].rows = next[selectedDivisionIdx].rows.map((row) => row.map(() => ".") as Cell[]);
    setDivisions(next);
    setSelectedRow(null);
    setMultiSelectedRows([]);
    setPendingLongStart(null);
    setManualExpandedGroups([]);
    setToast(`Div ${selectedDivisionIdx + 1}의 노트를 삭제했습니다.`);
  };

  const addDivision = () => {
    pushUndoSnapshot();
    const next = cloneDivisions(divisions);
    const current = next[selectedDivisionIdx];
    const newDivision: Division = {
      id: `${current.id}-insert-${Date.now()}`,
      bpm: current.bpm,
      delay: 0,
      beat: current.beat,
      split: current.split,
      rows: Array.from({ length: current.beat * current.split }, () => emptyRow()),
    };
    next.splice(selectedDivisionIdx + 1, 0, newDivision);
    setDivisions(next);
    setSelectedDivisionIdx(selectedDivisionIdx + 1);
    setSelectedRow({ divIdx: selectedDivisionIdx + 1, rowIdx: 0 });
    setMultiSelectedRows([]);
    setPendingLongStart(null);
    setToast(`Div ${selectedDivisionIdx + 1} 아래에 새 Division을 삽입했습니다.`);
  };

  const mergeDivisionWithBelow = () => {
    if (selectedDivisionIdx >= divisions.length - 1) {
      setToast("아래 Division이 없어 병합할 수 없습니다.");
      return;
    }
    pushUndoSnapshot();
    const next = cloneDivisions(divisions);
    const current = next[selectedDivisionIdx];
    const below = next[selectedDivisionIdx + 1];
    current.rows = [...current.rows, ...below.rows.map((row) => [...row] as Cell[])];
    next.splice(selectedDivisionIdx + 1, 1);
    setDivisions(next);
    setSelectedRow(null);
    setMultiSelectedRows([]);
    setPendingLongStart(null);
    setToast(`Div ${selectedDivisionIdx + 1}과 바로 아래 Division을 병합했습니다. 속성은 현재 Division 기준입니다.`);
  };

  const copySelection = () => {
    if (selectedCellRange) {
      const payload = toClipboardRowsFromSelectedCells(divisions, selectedCellRange);
      setClipboardData(payload);
      setToast(`${payload.rowCount}행 × ${payload.effectiveColCount}열 셀 범위를 클립보드에 복사했습니다.`);
      return;
    }

    const targets = getOrderedSelectedRows();
    if (targets.length === 0) {
      setToast("복사할 행 또는 셀 범위를 먼저 선택하세요.");
      return;
    }
    const payload = toClipboardRowsFromSelectedRows(divisions, targets);
    setClipboardData(payload);
    setToast(`${payload.rowCount}개 행을 클립보드에 복사했습니다.`);
  };

  const mirrorSelectionHorizontally = () => {
    if (selectedCellRange) {
      pushUndoSnapshot();
      const next = cloneDivisions(divisions);
      selectedCellRange.segments.forEach((segment) => {
        for (let rowIdx = segment.rowStart; rowIdx <= segment.rowEnd; rowIdx += 1) {
          next[segment.divIdx].rows[rowIdx] = mirrorCellRangeHorizontally(
            next[segment.divIdx].rows[rowIdx],
            selectedCellRange.colStart,
            selectedCellRange.colEnd,
          );
        }
      });
      setDivisions(next);
      setToast(
        `${selectedCellRange.totalRowCount}행 × ${selectedCellRange.colEnd - selectedCellRange.colStart + 1}열 셀 범위를 좌우반전했습니다.`,
      );
      return;
    }

    const targets = getOrderedSelectedRows();
    if (targets.length === 0) {
      setToast("좌우반전할 행 또는 셀 범위를 먼저 선택하세요.");
      return;
    }
    pushUndoSnapshot();
    const next = cloneDivisions(divisions);
    targets.forEach(({ divIdx, rowIdx }) => {
      next[divIdx].rows[rowIdx] = mirrorRowHorizontally(next[divIdx].rows[rowIdx]);
    });
    setDivisions(next);
    setToast(`${targets.length}개 행을 좌우반전했습니다.`);
  };

  const deleteSelectedRows = () => {
    const targets = getOrderedSelectedRows();
    if (targets.length === 0) {
      setToast("삭제할 행을 먼저 선택하세요.");
      return;
    }
    const grouped = new Map<number, Set<number>>();
    targets.forEach(({ divIdx, rowIdx }) => {
      if (!grouped.has(divIdx)) grouped.set(divIdx, new Set<number>());
      grouped.get(divIdx)!.add(rowIdx);
    });
    pushUndoSnapshot();
    const next = cloneDivisions(divisions);
    let deletedCount = 0;
    let keptOneEmptyRow = false;
    grouped.forEach((rowSet, divIdx) => {
      const remainingRows = next[divIdx].rows.filter((_, rowIdx) => !rowSet.has(rowIdx));
      deletedCount += rowSet.size;
      if (remainingRows.length === 0) {
        next[divIdx].rows = [emptyRow()];
        keptOneEmptyRow = true;
      } else {
        next[divIdx].rows = remainingRows;
      }
    });
    setDivisions(next);
    setSelectedRow(null);
    setMultiSelectedRows([]);
    setPendingLongStart(null);
    setManualExpandedGroups([]);
    setToast(
      keptOneEmptyRow
        ? `${deletedCount}개 행을 삭제했습니다. Division이 비지 않도록 빈 행 1개를 남겼습니다.`
        : `${deletedCount}개 행을 삭제했습니다.`,
    );
  };

  const pasteClipboard = () => {
    if (!clipboardData || clipboardData.rows.length === 0) {
      setToast("붙여넣을 복사 데이터가 없습니다.");
      return;
    }

    if (selectedCellRange) {
      pushUndoSnapshot();
      const next = cloneDivisions(divisions);
      const targetHeight = selectedCellRange.totalRowCount;
      const targetWidth = selectedCellRange.colEnd - selectedCellRange.colStart + 1;
      const appliedRows = Math.min(targetHeight, clipboardData.rowCount);
      const appliedCols = Math.min(targetWidth, clipboardData.effectiveColCount);
      const targetRows = getSelectedCellRangeRows(selectedCellRange);

      for (let rowOffset = 0; rowOffset < appliedRows; rowOffset += 1) {
        const targetRow = targetRows[rowOffset];
        for (let colOffset = 0; colOffset < appliedCols; colOffset += 1) {
          const value = clipboardData.rows[rowOffset][colOffset];
          if (value === "*") continue;
          next[targetRow.divIdx].rows[targetRow.rowIdx][selectedCellRange.colStart + colOffset] = value;
        }
      }

      setDivisions(next);
      if (targetHeight > clipboardData.rowCount || targetWidth > clipboardData.effectiveColCount) {
        setToast(`선택 범위가 더 커서 클립보드 크기인 ${appliedRows}행 × ${appliedCols}열만 붙여넣었습니다.`);
      } else if (appliedRows < clipboardData.rowCount || appliedCols < clipboardData.effectiveColCount) {
        setToast(`선택 범위 안에 겹치는 ${appliedRows}행 × ${appliedCols}열만 붙여넣었습니다.`);
      } else {
        setToast(`${appliedRows}행 × ${appliedCols}열 셀 범위를 붙여넣었습니다.`);
      }
      return;
    }

    const targets = getOrderedSelectedRows();
    if (targets.length === 0) {
      setToast("붙여넣을 행을 먼저 선택하세요.");
      return;
    }
    pushUndoSnapshot();
    const next = cloneDivisions(divisions);
    const pasteCount = Math.min(clipboardData.rowCount, targets.length);
    for (let i = 0; i < pasteCount; i += 1) {
      const target = targets[i];
      for (let colIdx = 0; colIdx < clipboardData.effectiveColCount; colIdx += 1) {
        const value = clipboardData.rows[i][colIdx];
        if (value === "*") continue;
        next[target.divIdx].rows[target.rowIdx][colIdx] = value;
      }
    }
    setDivisions(next);
    if (targets.length > clipboardData.rowCount) {
      setToast(`선택한 ${targets.length}행 중 클립보드 크기인 ${clipboardData.rowCount}행만 붙여넣었습니다.`);
    } else if (clipboardData.rowCount > targets.length) {
      setToast(`복사한 ${clipboardData.rowCount}행 중 ${targets.length}행만 붙여넣었습니다.`);
    } else {
      setToast(`${pasteCount}개 행에 노트를 붙여넣었습니다.`);
    }
  };

  const insertCopiedBlocks = () => {
    if (!clipboardData || clipboardData.rows.length === 0) {
      setToast("붙여넣을 복사 데이터가 없습니다.");
      return;
    }
    pushUndoSnapshot();
    const sourceDivision = divisions[selectedDivisionIdx];
    const newDivision: Division = {
      id: `${sourceDivision.id}-paste-${Date.now()}`,
      bpm: sourceDivision.bpm,
      delay: sourceDivision.delay,
      beat: sourceDivision.beat,
      split: sourceDivision.split,
      rows: clipboardData.rows.map((row) => row.map((cell) => (cell === "*" ? "." : cell)) as Cell[]),
    };
    const next = cloneDivisions(divisions);
    next.splice(selectedDivisionIdx, 0, newDivision);
    setDivisions(next);
    setSelectedRow({ divIdx: selectedDivisionIdx, rowIdx: 0 });
    setSelectedDivisionIdx(selectedDivisionIdx);
    setMultiSelectedRows([]);
    setPendingLongStart(null);
    setToast(`복사한 Division을 Div ${selectedDivisionIdx + 1}의 바로 위에 삽입했습니다.`);
  };

  const applyResize = () => {
    const nextCount = Number(resizeDraft);
    if (!Number.isFinite(nextCount) || nextCount < 1) {
      setToast("행 수는 1 이상이어야 합니다.");
      return;
    }
    pushUndoSnapshot();
    const next = cloneDivisions(divisions);
    const div = next[selectedDivisionIdx];
    const currentCount = div.rows.length;
    if (nextCount > currentCount) {
      for (let i = 0; i < nextCount - currentCount; i += 1) div.rows.push(emptyRow());
    } else if (nextCount < currentCount) {
      div.rows = div.rows.slice(0, nextCount);
    }
    setDivisions(next);
    setResizeOpen(false);
    setToast(`Div ${selectedDivisionIdx + 1}의 행 수를 ${nextCount}로 조정했습니다.`);
  };

  const applyProperty = () => {
    const bpmRaw = Number(propertyDraft.bpm.trim());
    const delayRaw = Number(propertyDraft.delay.trim());
    const beatRaw = Number(propertyDraft.beat.trim());
    const splitRaw = Number(propertyDraft.split.trim());

    if (![bpmRaw, delayRaw, beatRaw, splitRaw].every((v) => Number.isFinite(v))) {
      setToast("속성 값은 모두 숫자여야 합니다.");
      return;
    }
    if (!isIntegerLike(beatRaw) || !isIntegerLike(splitRaw)) {
      setToast("Beat와 Split은 정수만 입력할 수 있습니다.");
      return;
    }

    const bpm = roundToDecimals(bpmRaw, 8);
    const beat = Math.trunc(beatRaw);
    const split = Math.trunc(splitRaw);

    if (bpm < 0.1 || bpm > 999) {
      setToast("BPM은 0.1 이상 999 이하여야 합니다.");
      return;
    }
    if (beat < 1 || beat > 64) {
      setToast("Beat는 1 이상 64 이하의 정수여야 합니다.");
      return;
    }
    if (split < 1 || split > 128) {
      setToast("Split은 1 이상 128 이하의 정수여야 합니다.");
      return;
    }

    const delay = roundToDecimals(
      delayUnit === "ms" ? delayRaw : convertDelayValue(delayRaw, "beat", "ms", bpm),
      5,
    );

    pushUndoSnapshot();
    const next = cloneDivisions(divisions);
    next[selectedDivisionIdx] = {
      ...next[selectedDivisionIdx],
      bpm,
      delay,
      beat,
      split,
    };
    setDivisions(next);
    setPropertyDraft({
      bpm: String(bpm),
      delay: formatRounded(delayUnit === "ms" ? delay : convertDelayValue(delay, "ms", "beat", bpm), 5),
      beat: String(beat),
      split: String(split),
    });
    setPropertyOpen(false);
    setToast(`Div ${selectedDivisionIdx + 1}의 속성을 변경했습니다.`);
  };

  const deleteDivision = () => {
    if (divisions.length <= 1) {
      setToast("마지막 Division은 삭제할 수 없습니다.");
      setDeleteOpen(false);
      return;
    }
    const deletedIndex = selectedDivisionIdx;
    pushUndoSnapshot();
    const next = cloneDivisions(divisions);
    next.splice(deletedIndex, 1);
    const nextSelectedDivisionIdx = Math.max(0, Math.min(deletedIndex, next.length - 1));
    setDivisions(next);
    setSelectedDivisionIdx(nextSelectedDivisionIdx);
    setSelectedRow(null);
    setMultiSelectedRows([]);
    setPendingLongStart(null);
    setDeleteOpen(false);
    setToast(`Div ${deletedIndex + 1}을 삭제했습니다.`);
  };

  return (
    <div className="h-[100dvh] overflow-hidden overscroll-none bg-slate-100 text-slate-900">
      <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-hidden">
        <div className="z-40 shrink-0 border-b bg-white/95 backdrop-blur">
          <div className="px-3 pb-0 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full" onClick={() => setLeftPanelOpen(true)}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{currentUcsFileName}</div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {appSection === "workspace" ? "작업 화면" : "파일 화면"} · UCS Mobile Alpha 1
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={undoLastChange} disabled={undoStack.length === 0}>
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={togglePreviewPlayback}>
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {appSection === "workspace" ? (
            <>
              <div className="mt-3 flex items-center gap-2 rounded-2xl bg-slate-100 p-1">
                <Button variant={currentView === "editor" ? "default" : "ghost"} size="sm" className="flex-1 rounded-xl" onClick={openEditorScreen}>
                  Editor
                </Button>
                <Button variant={currentView === "preview" ? "default" : "ghost"} size="sm" className="flex-1 rounded-xl" onClick={() => openPreviewScreen(false)}>
                  Preview
                </Button>
              </div>

              <div className="mt-3 -mx-1 overflow-x-auto pb-1">
                <div className="flex min-w-max gap-2 px-1">
                  {divisions.map((div, idx) => (
                    <button
                      key={div.id}
                      onClick={() => {
                        const firstRow = { divIdx: idx, rowIdx: 0 };
                        const firstRowTimeMs = previewTimingData.rowTimeMap[refKey(idx, 0)]?.anchorTimeMs ?? 0;
                        setSelectedDivisionIdx(idx);
                        setSelectedRow(firstRow);
                        setPendingLongStart(null);
                        setMultiSelectedRows([]);
                        setSelectedCellRange(null);
                        setRangeAnchor(null);
                        setPendingEditorSyncTarget({ ...firstRow, timeMs: firstRowTimeMs });
                        setToast(`Div ${idx + 1}의 첫 번째 행으로 이동했습니다.`);
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${idx === selectedDivisionIdx ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}
                    >
                      Div {idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
              파일 가져오기, 새 UCS, 텍스트 복사, .ucs 다운로드를 이 화면에서 관리합니다.
            </div>
          )}
          </div>
        </div>

        <main className="flex-1 min-h-0 overflow-hidden">
          {appSection === "file" ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
              <div className="border-b bg-slate-50 px-4 py-3">
                <div className="text-base font-semibold">UCS 파일</div>
                <div className="mt-1 text-xs text-slate-500">새 UCS, 가져오기, 복사, 다운로드를 관리합니다.</div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col space-y-4 p-4">
                <input ref={importFileInputRef} type="file" className="hidden" onChange={handleImportFileChange} />
                <div className="grid gap-1">
                  <div className="text-xs font-medium text-slate-600">익스포트 파일명</div>
                  <div className="flex items-center gap-2">
                    <Input value={exportFileNameInput} onChange={(event) => handleExportFileNameChange(event.target.value)} placeholder="untitled" className="h-10 rounded-xl" />
                    <Badge variant="secondary" className="shrink-0">{currentUcsFileName}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="rounded-2xl" onClick={createNewUcs}><Plus className="mr-2 h-4 w-4" />새 UCS</Button>
                  <Button variant="outline" className="rounded-2xl" onClick={() => importFileInputRef.current?.click()}><Plus className="mr-2 h-4 w-4" />파일 가져오기</Button>
                  <Button variant="outline" className="rounded-2xl" onClick={openImportText}><Plus className="mr-2 h-4 w-4" />텍스트 가져오기</Button>
                  <Button variant="outline" className="rounded-2xl" onClick={copyUcsText}><Copy className="mr-2 h-4 w-4" />텍스트 복사</Button>
                  <Button variant="outline" className="rounded-2xl" onClick={downloadUcsFile}><Save className="mr-2 h-4 w-4" />.ucs 다운로드</Button>
                  <Button variant="outline" className="rounded-2xl" onClick={openWorkspaceSection}><ChevronLeft className="mr-2 h-4 w-4" />작업 화면</Button>
                </div>
                <textarea readOnly value={serializedUcs} className="min-h-0 flex-1 rounded-2xl border bg-slate-50 p-4 font-mono text-xs leading-5 text-slate-700" />
              </div>
            </div>
          ) : currentView === "editor" ? (
              <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
                  <div className="border-b bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 text-xs text-slate-600">Div {selectedDivisionIdx + 1} · BPM {selectedDivision.bpm} · Split {selectedDivision.split}</div>
                      <div className="flex items-center gap-1 rounded-full bg-white p-1 shadow-sm">
                        {ZOOM_LEVELS.map((level) => (
                          <Button
                            key={level}
                            variant={zoomLevel === level ? "default" : "ghost"}
                            size="sm"
                            className="h-7 rounded-full px-2 text-[11px]"
                            onClick={() => handleEditorZoomChange(level)}
                          >
                            {level}x
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="border-b bg-white px-3 py-2">
                    <div className="grid grid-cols-[68px_repeat(5,minmax(0,1fr))] gap-1 text-center text-[11px] text-slate-500">
                      <div></div>
                      {CELL_LABELS.map((label) => (
                        <div key={label} className="font-medium">{label}</div>
                      ))}
                    </div>
                  </div>

                  <div className="relative flex-1 min-h-0 bg-white">
                    <div ref={editorScrollRef} className="h-full overflow-y-auto px-2 py-3">
                      <div style={{ height: EDITOR_SCROLL_TOP_PADDING }} />
                      <div className="space-y-1">
                        {displayRows.map((item, index) => {
                          const prevItem = index > 0 ? displayRows[index - 1] : null;
                          const isDivisionBoundary = index > 0 && prevItem?.divIdx !== item.divIdx;

                          if (item.kind === "ghost") {
                            const isBoundary = item.ghostType === "boundary";
                            return (
                              <div key={item.displayKey} ref={(element) => { editorRowRefs.current[item.displayKey] = element; }}>
                                {isDivisionBoundary && (
                                  <div className="my-3 rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Division {item.divIdx + 1}</div>
                                      <div className="text-[11px] text-slate-500">BPM {divisions[item.divIdx].bpm} · Split {divisions[item.divIdx].split} · Delay {formatRounded(divisions[item.divIdx].delay, 3)} ms</div>
                                    </div>
                                  </div>
                                )}
                                {item.isMeasureStart && index !== 0 && <div className="my-2 h-px bg-slate-200" />}
                                <div className={`grid grid-cols-[68px_repeat(5,minmax(0,1fr))] gap-1 rounded-2xl px-1 py-0.5 ${isBoundary ? "opacity-90" : "opacity-65"}`}>
                                  <div className={`flex items-center justify-center rounded-xl text-[10px] ${isBoundary ? "border border-dashed border-slate-400 bg-slate-100 font-semibold text-slate-600" : "border border-dashed border-slate-300 bg-slate-50 text-slate-400"}`}>
                                    {item.label}
                                  </div>
                                  {item.cells.map((cell, colIdx) => (
                                    <div key={`ghost-cell-${index}-${colIdx}`} className={`aspect-square rounded-xl text-center text-xs font-medium ${isBoundary ? "border border-dashed border-slate-400 bg-slate-100/80 text-slate-600" : "border border-dashed border-slate-300 bg-slate-100/70 text-slate-500"}`}>
                                      {cell === "H" ? (isBoundary ? "│" : "H") : "·"}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }

                          const rowSelected = selectedRow?.divIdx === item.divIdx && selectedRow?.rowIdx === item.rowIdx;
                          const rowMultiSelected = isRowSelected(item.divIdx, item.rowIdx);
                          const divisionRowCount = divisions[item.divIdx].rows.length;
                          const divisionSplit = divisions[item.divIdx].split;
                          const divisionBeatLength = divisionRowCount / divisionSplit;
                          const hasShortDivisionCue = item.rowIdx === 0 && divisionBeatLength < 1 / zoomLevel;
                          const shortDivisionBeatLabel = hasShortDivisionCue ? formatBeatLengthLabel(divisionRowCount, divisionSplit) : null;
                          const rowLabelTone = rowSelected
                            ? "bg-slate-900 font-semibold text-white"
                            : rowMultiSelected
                              ? "bg-sky-100 font-semibold text-sky-900"
                              : hasShortDivisionCue
                                ? "border border-amber-200 bg-amber-50 font-semibold text-amber-900"
                                : item.isRepresentative
                                  ? "bg-slate-200 font-bold text-slate-900"
                                  : item.isExpandedHidden
                                    ? "border border-slate-200 bg-slate-50 text-slate-600"
                                    : "bg-slate-100 text-slate-500";

                          return (
                            <div key={item.displayKey} ref={(element) => { editorRowRefs.current[item.displayKey] = element; }}>
                              {isDivisionBoundary && (
                                <div className="my-3 rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Division {item.divIdx + 1}</div>
                                    <div className="text-[11px] text-slate-500">BPM {divisions[item.divIdx].bpm} · Split {divisions[item.divIdx].split} · Delay {formatRounded(divisions[item.divIdx].delay, 3)} ms</div>
                                  </div>
                                </div>
                              )}
                              {item.isMeasureStart && index !== 0 && <div className="my-2 h-px bg-slate-200" />}
                              <div className={`grid grid-cols-[68px_repeat(5,minmax(0,1fr))] gap-1 rounded-2xl p-1 ${rowSelected ? "bg-slate-100 ring-1 ring-slate-300" : rowMultiSelected ? "bg-sky-50 ring-1 ring-sky-200" : ""} ${item.isExpandedHidden ? "pl-3" : ""}`}>
                                <button
                                  onClick={() => handleActualRowTap(item)}
                                  onDoubleClick={() => {
                                    if (item.isRepresentative && item.isOpen) collapseGroup(item);
                                  }}
                                  className={`rounded-xl px-2 py-2 text-left text-xs transition ${rowLabelTone}`}
                                  onPointerDown={(event) => handleRowPointerDown(item, event)}
                                  onPointerMove={handleRowPointerMove}
                                  onPointerUp={handleRowPointerEnd}
                                  onPointerLeave={handleRowPointerEnd}
                                  onPointerCancel={handleRowPointerEnd}
                                >
                                  <span>
                                    {item.isRepresentative
                                      ? `${item.isOpen ? "▾" : "▸"} ${item.label}${item.hiddenCount > 0 ? ` +${item.hiddenCount}` : ""}`
                                      : item.isExpandedHidden
                                        ? `↳ ${item.label}`
                                        : item.label}
                                  </span>
                                  {shortDivisionBeatLabel && <span className="ml-1">· {shortDivisionBeatLabel}</span>}
                                </button>
                                {item.cells.map((cell, colIdx) => {
                                  const isPending = pendingLongStart?.divIdx === item.divIdx && pendingLongStart?.rowIdx === item.rowIdx && pendingLongStart?.colIdx === colIdx;
                                  const isRangeCell = isCellRangeSelected(item.divIdx, item.rowIdx, colIdx);
                                  const isAnchorCell = isRangeAnchorCell(item.divIdx, item.rowIdx, colIdx);
                                  const marker = item.hiddenMarkers?.[colIdx];
                                  const markerText = marker ? (marker.hasM && marker.hasW ? "(M,W)" : marker.hasM ? "(M)" : marker.hasW ? "(W)" : "") : "";
                                  const showMarker = Boolean(markerText) && item.isRepresentative && !item.isOpen;

                                  return (
                                    <button
                                      key={`${item.divIdx}-${item.rowIdx}-${colIdx}`}
                                      onClick={() => handleCellTap(item.divIdx, item.rowIdx, colIdx)}
                                      onPointerDown={(event) => handleCellPointerDown(item.divIdx, item.rowIdx, colIdx, event)}
                                      onPointerMove={handleCellPointerMove}
                                      onPointerUp={handleCellPointerEnd}
                                      onPointerLeave={handleCellPointerEnd}
                                      onPointerCancel={handleCellPointerEnd}
                                      className={`relative aspect-square rounded-xl border text-sm font-semibold transition ${isAnchorCell ? "border-sky-500 bg-sky-100 text-sky-900 ring-2 ring-sky-300" : isRangeCell ? "border-sky-400 bg-sky-50 text-sky-900" : isPending ? "border-slate-900 bg-slate-900 text-white" : cell === "." ? item.isExpandedHidden ? "border-slate-200 bg-slate-50 text-slate-300" : "border-slate-200 bg-white text-slate-300" : getEditorNoteTone(colIdx, cell)}`}
                                    >
                                      <span>{cell === "." ? "·" : cell}</span>
                                      {showMarker && <span className="pointer-events-none absolute bottom-1 right-1 text-[9px] font-medium text-slate-500">{markerText}</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        <div style={{ height: editorScrollBottomPadding }} />
                      </div>
                    </div>
                    <div className="pointer-events-none absolute left-2 right-2 z-20 border-t-2 border-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.78)]" style={{ top: `${EDITOR_JUDGE_LINE_RATIO * 100}%` }} />
                  </div>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-950">
                <div className="flex min-h-0 flex-1 flex-col bg-slate-950 px-4 py-4">
                  <div className="relative flex min-h-0 flex-1 flex-col">
                    <button
                      type="button"
                      onClick={() => setPreviewInfoPanelOpen((prev) => !prev)}
                      className="absolute right-0 top-6 z-50 rounded-l-2xl border border-r-0 border-slate-600 bg-slate-900/90 px-3 py-2 text-[11px] font-semibold text-white shadow-lg backdrop-blur"
                    >
                      {previewInfoPanelOpen ? "정보 닫기" : "정보 열기"}
                    </button>

                    {previewInfoPanelOpen && (
                      <div className="absolute right-0 top-16 z-50 w-[260px] max-w-[72vw] max-h-[calc(100%-5rem)] overflow-y-auto overscroll-contain rounded-l-[24px] border border-r-0 border-slate-600 bg-slate-950/92 p-3 text-white shadow-2xl backdrop-blur">

                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Preview Info</div>
                          <div className="text-[11px] text-slate-400">오른쪽 패널</div>
                        </div>
                        <Badge variant="secondary" className="bg-white/10 text-white">{previewCurrentRowText}</Badge>
                      </div>
                      <div className="space-y-3 text-xs">
                        <div className="rounded-2xl bg-white/5 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Actual Row</div>
                          <div className="mt-1 text-sm font-semibold text-white">{previewCurrentRowLabelText}</div>
                        </div>
                        <div className="rounded-2xl bg-white/5 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Preview Zoom</div>
                          <div className="mt-2 flex items-center gap-2">
                            <Button type="button" variant="outline" size="sm" className="h-8 rounded-xl border-white/20 bg-white/5 px-3 text-white hover:bg-white/10" onClick={() => applyPreviewZoom(previewZoom - 0.1)}>
                              -0.1
                            </Button>
                            <Input
                              value={previewZoomDraft}
                              onChange={(event) => setPreviewZoomDraft(event.target.value)}
                              onBlur={commitPreviewZoomDraft}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  commitPreviewZoomDraft();
                                  event.currentTarget.blur();
                                }
                              }}
                              className="h-8 rounded-xl border-white/15 bg-white/10 text-center text-white"
                            />
                            <Button type="button" variant="outline" size="sm" className="h-8 rounded-xl border-white/20 bg-white/5 px-3 text-white hover:bg-white/10" onClick={() => applyPreviewZoom(previewZoom + 0.1)}>
                              +0.1
                            </Button>
                          </div>
                        </div>
                        <div className="rounded-2xl bg-white/5 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Hitsound</div>
                            <span className="text-[11px] text-slate-300">{Math.round(previewHitsoundVolume * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={Math.round(previewHitsoundVolume * 100)}
                            onChange={(event) => setPreviewHitsoundVolume(normalizeHitsoundVolume(Number(event.target.value) / 100))}
                            className="h-2 w-full accent-cyan-300"
                          />
                        </div>
                        <div className="rounded-2xl bg-white/5 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Preview Audio</div>
                          <div className="mt-2 flex items-center gap-2">
                            <input ref={previewAudioFileInputRef} type="file" accept=".mp3,.m4a,.wav,.ogg,.webm,audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/ogg,audio/webm" className="hidden" onChange={handlePreviewAudioFileChange} />
                            <Button type="button" variant="outline" size="sm" className="h-8 rounded-xl border-white/20 bg-white/5 px-3 text-white hover:bg-white/10" onClick={() => previewAudioFileInputRef.current?.click()}>
                              {previewAudioReconnectNeeded ? "다시 연결" : previewAudioSrc ? "교체" : "Upload"}
                            </Button>
                            {previewAudioReconnectNeeded ? (
                              <Button type="button" variant="outline" size="sm" className="h-8 rounded-xl border-white/20 bg-white/5 px-3 text-white hover:bg-white/10" onClick={dismissPreviewAudioReconnect}>
                                무시
                              </Button>
                            ) : (
                              <Button type="button" variant="outline" size="sm" className="h-8 rounded-xl border-white/20 bg-white/5 px-3 text-white hover:bg-white/10" onClick={clearPreviewAudio} disabled={!previewAudioSrc}>
                                Clear
                              </Button>
                            )}
                          </div>
                          <div className="mt-2 rounded-xl bg-slate-900/40 px-3 py-2 text-[11px] text-slate-400">원격 URL 입력은 배포 보안 설정에 따라 숨겨져 있습니다.</div>
                          {previewAudioReconnectNeeded && (
                            <div className="mt-2 rounded-xl bg-amber-400/10 px-3 py-2 text-[11px] text-amber-100">
                              최근 작업은 복원되었지만 오디오 파일은 다시 선택해야 합니다.
                            </div>
                          )}
                          <div className="mt-2 text-[11px] text-slate-400">{previewAudioLabel}</div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                            <span>{previewAudioReconnectNeeded ? "RECONNECT" : previewAudioMode === "none" ? "OFF" : previewAudioMode.toUpperCase()}</span>
                            <span>·</span>
                            <span>{previewAudioReconnectNeeded ? "RECONNECT NEEDED" : previewAudioStatus === "idle" ? "IDLE" : previewAudioStatus === "loading" ? "LOADING" : previewAudioStatus === "ready" ? "READY" : "ERROR"}</span>
                          </div>
                          {previewAudioError && <div className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-[11px] text-red-200">{previewAudioError}</div>}
                        </div>
                      </div>
                    </div>
                    )}

                    <div
                      className="relative flex-1 min-h-0 overflow-hidden rounded-[28px] border border-slate-700 bg-[radial-gradient(circle_at_top,_rgba(51,65,85,0.45),_rgba(2,6,23,0.98))]"
                      style={{ height: previewViewportHeight, touchAction: "none" }}
                      onWheel={handlePreviewWheel}
                      onPointerDown={handlePreviewPointerDown}
                      onPointerMove={handlePreviewPointerMove}
                      onPointerUp={handlePreviewPointerEnd}
                      onPointerCancel={handlePreviewPointerEnd}
                    >
                      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.05),rgba(255,255,255,0.015),rgba(0,0,0,0.26))]" />
                      <div className="absolute inset-x-0 top-0 z-30 px-4 py-2">
                        <div className="rounded-2xl bg-slate-950/65 px-3 py-2 backdrop-blur-sm">
                          <div className="flex items-end justify-between gap-3 text-slate-200">
                            <span className="text-[18px] font-bold leading-none tracking-[0.01em]">Combo {previewCurrentCombo} / {previewTotalCombo}</span>
                            <span className="text-[11px] text-slate-300">{formatPreviewTimeMs(previewProgressCurrentMs)} / {formatPreviewTimeMs(previewProgressDurationMs)} ms</span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
                            <div className="h-full rounded-full bg-cyan-300/90 transition-[width] duration-100" style={{ width: `${previewProgressPercent}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="absolute inset-x-0 top-0 z-10 grid grid-cols-5 px-5 py-3 text-center text-xs font-semibold text-slate-300">
                        {CELL_LABELS.map((label, colIdx) => (
                          <div key={`preview-label-${label}`} className="py-2" style={{ transform: `translateX(${previewLaneInwardOffsets[colIdx]}px)` }}>
                            {label}
                          </div>
                        ))}
                      </div>
                      <div className="pointer-events-none absolute inset-x-0 z-10 grid grid-cols-5 px-5 py-3" style={{ top: previewJudgeLineY }}>
                        <div className="pointer-events-none absolute left-6 right-6 top-0 border-t border-cyan-200/50" style={{ transform: "translateY(2px)" }} />
                        {CELL_LABELS.map((label, colIdx) => {
                          const isFlashing = previewLaneFlash[colIdx];
                          const isHolding = previewLaneHoldActive[colIdx];
                          const beatPulseActive = !isFlashing && !isHolding && previewBeatPulseStrength > 0;
                          const receptorScale = isFlashing ? 1.12 : isHolding ? 1.05 : 1;
                          const receptorOpacity = isFlashing ? 1 : isHolding ? 0.96 : beatPulseActive ? 0.85 + previewBeatPulseStrength * 0.08 : 0.85;
                          const receptorBrightness = isFlashing ? 1.2 : isHolding ? 1.08 : beatPulseActive ? 1 + previewBeatPulseStrength * 0.06 : 1;
                          const glowOpacityClass = isFlashing ? "opacity-100" : isHolding ? "opacity-70" : "opacity-0";
                          const glowSizeClass = isFlashing ? "h-16 w-16 blur-xl" : "h-14 w-14 blur-lg";
                          const shadowClass = isFlashing
                            ? "drop-shadow-[0_0_16px_rgba(103,232,249,0.95)]"
                            : isHolding
                              ? "drop-shadow-[0_0_12px_rgba(103,232,249,0.55)]"
                              : beatPulseActive
                                ? "drop-shadow-[0_0_8px_rgba(103,232,249,0.22)]"
                                : "";
                          const beatPulseGlowOpacity = beatPulseActive ? `${0.1 + previewBeatPulseStrength * 0.2}` : "0";

                          return (
                            <div key={`preview-receptor-${label}`} className="relative flex justify-center" style={{ transform: `translateX(${previewLaneInwardOffsets[colIdx]}px)` }}>
                              <>
                              <div
                                className="pointer-events-none absolute left-1/2 top-0 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/25 blur-md transition-opacity duration-100"
                                style={{ opacity: beatPulseGlowOpacity }}
                              />
                              <div className={`pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/35 transition-all duration-100 ${glowSizeClass} ${glowOpacityClass}`} />
                            </>
                              <img
                                src={getReceptorPath(colIdx)}
                                alt={`${label}-receptor`}
                                className={`object-contain transition-[transform,opacity,filter] duration-100 ${shadowClass}`}
                                style={{
                                  width: previewNoteSize,
                                  height: previewNoteSize,
                                  opacity: receptorOpacity,
                                  transform: `translateY(-50%) scale(${receptorScale})`,
                                  filter: `brightness(${receptorBrightness})`,
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="absolute inset-0 z-20 grid grid-cols-5 gap-0 px-5 py-3">
                        {CELL_LABELS.map((label, colIdx) => (
                          <div key={`preview-lane-${label}`} className="relative h-full overflow-hidden" style={{ transform: `translateX(${previewLaneInwardOffsets[colIdx]}px)` }}>
                            {previewHoldEventsByLane[colIdx].map((event, holdIndex) => (
                              <React.Fragment key={`preview-hold-${colIdx}-${holdIndex}-${event.startDivIdx}-${event.startRowIdx}`}>
                                <div
                                  className="absolute left-1/2 z-0 -translate-x-1/2 bg-repeat-y"
                                  style={{
                                    top: event.bodyTop,
                                    height: event.bodyHeight,
                                    width: previewBodyWidth,
                                    backgroundImage: `url(${getSpritePath(colIdx, "body")})`,
                                    backgroundSize: `${previewBodyWidth}px 2px`,
                                  }}
                                />
                                <img src={getSpritePath(colIdx, "tail")} alt={`${CELL_LABELS[colIdx]}-tail`} className="absolute left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 object-contain" style={{ top: event.endY, width: previewNoteSize, height: previewNoteSize }} />
                                <img src={getSpritePath(colIdx, "head")} alt={`${CELL_LABELS[colIdx]}-head`} className="absolute left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 object-contain" style={{ top: event.startY, width: previewNoteSize, height: previewNoteSize }} />
                              </React.Fragment>
                            ))}
                            {previewTapEventsByLane[colIdx].map((event, tapIndex) => (
                              <img key={`preview-tap-${colIdx}-${tapIndex}-${event.divIdx}-${event.rowIdx}`} src={getSpritePath(colIdx, "tap")} alt={`${CELL_LABELS[colIdx]}-tap`} className="absolute left-1/2 z-30 -translate-x-1/2 -translate-y-1/2 object-contain" style={{ top: event.y, width: previewNoteSize, height: previewNoteSize }} />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
            </div>
          )}
        </main>
        {appSection === "workspace" && currentView === "editor" && toolSheetOpen && (
        <div className="fixed inset-x-0 bottom-[118px] z-40">
          <div className="mx-auto w-full max-w-md px-3">
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-max gap-3">
                <div className="w-[260px] shrink-0 rounded-[28px] border bg-white p-4 shadow-xl">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">선택 도구</div>
                      <div className="text-[11px] text-slate-500">선택 범위와 행에 적용</div>
                    </div>
                    <Badge variant="secondary">Selection</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="rounded-2xl" onClick={() => { selectWholeDivision(); closeToolSheet(); }}>
                      <Rows3 className="mr-2 h-4 w-4" />전체 선택
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => { collapseAll(); closeToolSheet(); }}>
                      Collapse All
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => { copySelection(); closeToolSheet(); }}>
                      <Copy className="mr-2 h-4 w-4" />복사
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => { pasteClipboard(); closeToolSheet(); }}>
                      <Copy className="mr-2 h-4 w-4" />붙여넣기
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => { mirrorSelectionHorizontally(); closeToolSheet(); }}>
                      <StretchHorizontal className="mr-2 h-4 w-4" />좌우반전
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => { deleteSelectedRows(); closeToolSheet(); }}>
                      <Trash2 className="mr-2 h-4 w-4" />행 삭제
                    </Button>
                  </div>
                </div>

                <div className="w-[320px] shrink-0 rounded-[28px] border bg-white p-4 shadow-xl">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">Division 도구</div>
                      <div className="text-[11px] text-slate-500">현재 선택된 Division에 적용</div>
                    </div>
                    <Badge variant="secondary">Division</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="rounded-2xl" onClick={() => { openProperty(); closeToolSheet(); }}>
                      <SlidersHorizontal className="mr-2 h-4 w-4" />속성
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => { openResize(); closeToolSheet(); }}>
                      <StretchHorizontal className="mr-2 h-4 w-4" />Resize
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => { openAdjustSplitBeat(); closeToolSheet(); }}>
                      <StretchHorizontal className="mr-2 h-4 w-4" />Adjust
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => { splitHere(); closeToolSheet(); }}>
                      <Scissors className="mr-2 h-4 w-4" />Split Here
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => { cleanDivisionNotes(); closeToolSheet(); }}>
                      <Trash2 className="mr-2 h-4 w-4" />Clean
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => { addDivision(); closeToolSheet(); }}>
                      <Plus className="mr-2 h-4 w-4" />Add Block
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => { insertCopiedBlocks(); closeToolSheet(); }}>
                      <Copy className="mr-2 h-4 w-4" />Insert Copy
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => { mergeDivisionWithBelow(); closeToolSheet(); }}>
                      <Rows3 className="mr-2 h-4 w-4" />Merge
                    </Button>
                    <Button variant="outline" className="col-span-2 rounded-2xl text-red-600" onClick={() => { setDeleteOpen(true); closeToolSheet(); }}>
                      <Trash2 className="mr-2 h-4 w-4" />Division 삭제
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {appSection === "workspace" && (
        <div className="z-40 shrink-0 border-t bg-white/95 backdrop-blur">
          <div className="mx-auto w-full max-w-md px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
            {currentView === "editor" ? (
              <>
                <div className="grid grid-cols-4 gap-2">
                  <Button onClick={() => { setMode("note"); setSelectTool("row_single"); clearAllSelection(); }} className={`h-11 rounded-2xl text-sm ${mode === "note" ? "" : "bg-slate-200 text-slate-900 hover:bg-slate-300"}`}>X</Button>
                  <Button onClick={() => { setMode("long"); if (pendingLongStart && isTemporaryLongStart) { setIsTemporaryLongStart(false); clearSelectOnlyState(); setSelectedDivisionIdx(pendingLongStart.divIdx); setSelectedRow({ divIdx: pendingLongStart.divIdx, rowIdx: pendingLongStart.rowIdx }); setToast("임시 롱모드를 정식 롱노트 모드로 전환했습니다."); return; } clearAllSelection(); }} className={`h-11 rounded-2xl text-sm ${mode === "long" ? "" : "bg-slate-200 text-slate-900 hover:bg-slate-300"}`}>롱노트</Button>
                  <Button onClick={() => { setMode("select"); setPendingLongStart(null); setIsTemporaryLongStart(false); setRangeAnchor(null); setSelectedCellRange(null); }} className={`h-11 rounded-2xl text-sm ${mode === "select" ? "" : "bg-slate-200 text-slate-900 hover:bg-slate-300"}`}>선택</Button>
                  <Button variant={toolSheetOpen ? "default" : "outline"} onClick={() => setToolSheetOpen((prev) => !prev)} className="h-11 rounded-2xl text-sm">
                    <SlidersHorizontal className="mr-1 h-4 w-4" />도구
                  </Button>
                </div>
                {mode === "select" && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button variant={selectTool === "row_single" ? "default" : "outline"} className="h-10 rounded-2xl text-sm" onClick={() => { setSelectTool("row_single"); clearSelectOnlyState(); setToast("행 단일 선택 모드로 전환했습니다."); }}>행 단일</Button>
                    <Button variant={selectTool === "range" ? "default" : "outline"} className="h-10 rounded-2xl text-sm" onClick={() => { setSelectTool("range"); clearSelectOnlyState(); setToast("범위 선택 모드로 전환했습니다."); }}>범위 선택</Button>
                  </div>
                )}
                <div className="mt-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-600">{selectedCellRangeSize ? `셀 범위 ${selectedCellRangeSize}` : currentPointerText}</div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Button className="h-11 rounded-2xl text-sm" onClick={togglePreviewPlayback}>{isPlaying ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}{isPlaying ? "Pause" : "Play"}</Button>
                  <Button variant="outline" className="h-11 rounded-2xl text-sm" onClick={openEditorScreen}><ChevronLeft className="mr-2 h-4 w-4" />Editor로</Button>
                </div>
                <div className="mt-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-600">{previewCurrentRowText} · {formatPreviewTimeMs(previewCursorTimeMs)} ms</div>
              </>
            )}
          </div>
        </div>
      )}

        {leftPanelOpen && (
          <div className="fixed inset-0 z-[70] bg-black/30">
            <button
              type="button"
              className="absolute inset-0"
              onClick={() => setLeftPanelOpen(false)}
              aria-label="패널 닫기"
            />
            <div className="absolute left-0 top-0 flex h-full w-[290px] max-w-[82vw] flex-col border-r bg-white shadow-2xl">
              <div className="border-b px-4 py-4">
                <div className="text-base font-semibold">UCS Mobile</div>
                <div className="mt-1 text-xs text-slate-500">화면 이동 패널</div>
              </div>
              <div className="flex-1 p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Navigation</div>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={openWorkspaceSection}
                    className={`flex w-full items-start rounded-2xl border px-3 py-3 text-left transition ${appSection === "workspace" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}
                  >
                    <div>
                      <div className="text-sm font-semibold">작업 화면</div>
                      <div className={`mt-1 text-xs ${appSection === "workspace" ? "text-slate-200" : "text-slate-500"}`}>Editor / Preview를 여기서 전환합니다.</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={openFileSection}
                    className={`flex w-full items-start rounded-2xl border px-3 py-3 text-left transition ${appSection === "file" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}
                  >
                    <div>
                      <div className="text-sm font-semibold">파일 화면</div>
                      <div className={`mt-1 text-xs ${appSection === "file" ? "text-slate-200" : "text-slate-500"}`}>새 UCS, 가져오기, 복사, 다운로드를 관리합니다.</div>
                    </div>
                  </button>
                </div>
              </div>
              <div className="border-t px-3 py-3">
                <Button variant="outline" className="w-full rounded-2xl" onClick={() => setLeftPanelOpen(false)}>
                  닫기
                </Button>
              </div>
            </div>
          </div>
        )}

        {importTextOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4">
            <div className="w-full max-w-xl rounded-[28px] bg-white p-4 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">UCS 텍스트 가져오기</div>
                  <div className="text-xs text-slate-500">붙여넣은 내용을 파싱해 현재 차트를 전체 교체합니다.</div>
                </div>
                <Badge variant="secondary">Replace Import</Badge>
              </div>
              <textarea value={importTextDraft} onChange={(event) => setImportTextDraft(event.target.value)} placeholder={[":Format=1", ":Mode=Single", ":BPM=120", ":Delay=0", ":Beat=4", ":Split=2", ".....", "X...."].join(String.fromCharCode(10))} className="h-[320px] w-full rounded-2xl border bg-slate-50 p-4 font-mono text-xs leading-5 text-slate-700" />
              <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">헤더(:Format=1, :Mode=Single)와 각 Division의 BPM / Delay / Beat / Split, 그리고 5글자 노트 행을 그대로 붙여넣으면 됩니다.</div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setImportTextOpen(false)}>취소</Button>
                <Button className="flex-1" onClick={importUcsFromText}>가져오기</Button>
              </div>
            </div>
          </div>
        )}

        {resizeOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4">
            <div className="w-full max-w-sm rounded-[28px] bg-white p-4 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">Resize Division</div>
                  <div className="text-xs text-slate-500">Div {selectedDivisionIdx + 1}의 행 수 조정</div>
                </div>
                <Badge variant="secondary">현재 {divisions[selectedDivisionIdx].rows.length}행</Badge>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-sm font-medium">전체 행 수</div>
                  <Input value={resizeDraft} onChange={(e) => setResizeDraft(e.target.value)} />
                </div>
                <div className="rounded-2xl border p-3">
                  <div className="mb-2 text-sm font-medium">행 단위 조정</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setResizeDraft(String(Math.max(1, Number(resizeDraft || "1") - 1)))}>행 -1</Button>
                    <Button variant="outline" onClick={() => setResizeDraft(String(Number(resizeDraft || "0") + 1))}>행 +1</Button>
                  </div>
                </div>
                <div className="rounded-2xl border p-3">
                  <div className="mb-2 text-sm font-medium">마디 단위 조정</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setResizeDraft(String(Math.max(1, Number(resizeDraft || rowsPerMeasure) - rowsPerMeasure)))}>마디 -1</Button>
                    <Button variant="outline" onClick={() => setResizeDraft(String(Number(resizeDraft || "0") + rowsPerMeasure))}>마디 +1</Button>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">한 마디 기준 실제 행 수는 {rowsPerMeasure}행이다.</div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setResizeOpen(false)}>취소</Button>
                <Button className="flex-1" onClick={applyResize}>적용</Button>
              </div>
            </div>
          </div>
        )}

        {adjustOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4">
            <div className="w-full max-w-sm rounded-[28px] bg-white p-4 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">Adjust SplitBeat</div>
                  <div className="text-xs text-slate-500">Div {selectedDivisionIdx + 1}의 Split만 조정</div>
                </div>
                <Badge variant="secondary">현재 {divisions[selectedDivisionIdx].split}</Badge>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3 text-center text-lg">
                  <div className="rounded-xl bg-slate-50 py-3 font-semibold text-slate-700">{divisions[selectedDivisionIdx].split}</div>
                  <div className="text-slate-400">→</div>
                  <Input value={adjustDraft.nextSplit} onChange={(e) => setAdjustDraft({ nextSplit: e.target.value })} className="text-center text-base" />
                  <div className="text-sm text-slate-500">Split/Beat</div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" disabled={divisions[selectedDivisionIdx].split >= 65} onClick={() => setAdjustDraft({ nextSplit: String(divisions[selectedDivisionIdx].split * 2) })}>× 2</Button>
                  <Button type="button" variant="outline" disabled={divisions[selectedDivisionIdx].split % 2 !== 0} onClick={() => setAdjustDraft({ nextSplit: String(divisions[selectedDivisionIdx].split / 2) })}>/ 2</Button>
                </div>
              </div>
              <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">Beat는 유지되고 Split만 변경된다.</div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setAdjustOpen(false); setAdjustWarningOpen(false); setPendingAdjustTarget(null); }}>Cancel</Button>
                <Button className="flex-1" onClick={applyAdjustSplitBeat}>OK</Button>
              </div>
            </div>
          </div>
        )}

        {adjustWarningOpen && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-[28px] bg-white p-4 shadow-2xl">
              <div className="mb-3 text-lg font-semibold">길이가 변경됩니다</div>
              <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">현재 미완성 박 길이를 새 Split으로 정확히 변환할 수 없습니다. 가장 가까운 길이로 조정하여 계속할까요?</div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setAdjustWarningOpen(false); setPendingAdjustTarget(null); }}>취소</Button>
                <Button className="flex-1" onClick={confirmAdjustSplitBeatWarning}>확인</Button>
              </div>
            </div>
          </div>
        )}

        {propertyOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4">
            <div className="w-full max-w-sm rounded-[28px] bg-white p-4 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">Division 속성</div>
                  <div className="text-xs text-slate-500">Div {selectedDivisionIdx + 1}의 BPM / Delay / Beat / Split</div>
                </div>
                <Badge variant="secondary">현재 Div {selectedDivisionIdx + 1}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1 text-sm font-medium">BPM</div>
                  <Input value={propertyDraft.bpm} onChange={(e) => setPropertyDraft((prev) => ({ ...prev, bpm: e.target.value }))} />
                </div>
                <div>
                  <div className="mb-1 text-sm font-medium">Beat</div>
                  <Input value={propertyDraft.beat} onChange={(e) => setPropertyDraft((prev) => ({ ...prev, beat: e.target.value }))} />
                </div>
                <div>
                  <div className="mb-1 text-sm font-medium">Split</div>
                  <Input value={propertyDraft.split} onChange={(e) => setPropertyDraft((prev) => ({ ...prev, split: e.target.value }))} />
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">BPM은 0.1~999 범위의 실수이며 적용 시 소수점 8자리에서 반올림된다.</div>
              </div>
              <div className="mt-3 rounded-2xl border p-3">
                <div className="mb-2 text-sm font-medium">Delay</div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
                  <Input value={propertyDraft.delay} onChange={(e) => setPropertyDraft((prev) => ({ ...prev, delay: e.target.value }))} />
                  <Button type="button" variant={delayUnit === "ms" ? "default" : "outline"} size="sm" onClick={() => toggleDelayUnit("ms")}>ms</Button>
                  <Button type="button" variant={delayUnit === "beat" ? "default" : "outline"} size="sm" onClick={() => toggleDelayUnit("beat")}>beat</Button>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setPropertyOpen(false)}>취소</Button>
                <Button className="flex-1" onClick={applyProperty}>적용</Button>
              </div>
            </div>
          </div>
        )}

        {rowDivisionSheetOpen && (
          <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/30 p-4">
            <button type="button" className="absolute inset-0" onClick={closeRowDivisionSheet} aria-label="행 작업 닫기" />
            <div className="relative w-full max-w-sm rounded-[28px] bg-white p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold">행 Division 작업</div>
                  <div className="text-xs text-slate-500">{selectedRow ? actualRowLabel(divisions, selectedRow.divIdx, selectedRow.rowIdx) : "행 선택 없음"}</div>
                </div>
                <Badge variant="secondary">Quick</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="rounded-2xl" onClick={() => { closeRowDivisionSheet(); openProperty(); }}>
                  <SlidersHorizontal className="mr-2 h-4 w-4" />속성
                </Button>
                <Button variant="outline" className="rounded-2xl" onClick={() => { closeRowDivisionSheet(); openResize(); }}>
                  <StretchHorizontal className="mr-2 h-4 w-4" />Resize
                </Button>
                <Button variant="outline" className="rounded-2xl" onClick={() => { closeRowDivisionSheet(); openAdjustSplitBeat(); }}>
                  <StretchHorizontal className="mr-2 h-4 w-4" />Adjust
                </Button>
                <Button variant="outline" className="rounded-2xl" onClick={() => { closeRowDivisionSheet(); splitHere(); }}>
                  <Scissors className="mr-2 h-4 w-4" />Split Here
                </Button>
                <Button variant="outline" className="rounded-2xl" onClick={() => { closeRowDivisionSheet(); mergeDivisionWithBelow(); }}>
                  <Rows3 className="mr-2 h-4 w-4" />Merge
                </Button>
                <Button variant="outline" className="rounded-2xl text-red-600" onClick={() => { closeRowDivisionSheet(); deleteSelectedRows(); }}>
                  <Trash2 className="mr-2 h-4 w-4" />행 삭제
                </Button>
              </div>
              <div className="mt-4">
                <Button variant="outline" className="w-full rounded-2xl" onClick={closeRowDivisionSheet}>닫기</Button>
              </div>
            </div>
          </div>
        )}

        {deleteOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4">
            <div className="w-full max-w-sm rounded-[28px] bg-white p-4 shadow-2xl">
              <div className="mb-3 text-lg font-semibold">Division 삭제</div>
              <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">Div {selectedDivisionIdx + 1}을 삭제합니다. 이 Division의 모든 행과 속성이 제거됩니다.</div>
              <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">{divisions.length <= 1 ? "마지막 Division은 삭제할 수 없습니다." : "삭제 후에는 되돌리기 기능이 필요할 수 있습니다. 현재 Alpha 1에서는 즉시 반영됩니다."}</div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteOpen(false)}>취소</Button>
                <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={deleteDivision}>삭제</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


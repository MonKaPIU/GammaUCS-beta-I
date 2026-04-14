export type TempSpriteKind = "tap" | "head" | "body" | "tail";

const LOCAL_ASSET_BASES = {
  notes: "/assets/notes",
  receptor: "/assets/receptor",
  hitsounds: "/assets/hitsounds",
} as const;

const NOTE_SUFFIX: Record<TempSpriteKind, string> = {
  tap: "X",
  head: "M",
  body: "H",
  tail: "W",
};

export function getSpritePath(colIdx: number, kind: TempSpriteKind): string {
  return `${LOCAL_ASSET_BASES.notes}/${colIdx + 1}${NOTE_SUFFIX[kind]}.png`;
}

export function getReceptorPath(colIdx: number): string {
  return `${LOCAL_ASSET_BASES.receptor}/${colIdx + 1}XR.png`;
}

export const PREVIEW_HITSOUND_URL = `${LOCAL_ASSET_BASES.hitsounds}/chuckmodilowcut.wav`;
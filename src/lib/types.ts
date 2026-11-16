export type Frame = {
  id: string;
  /** Dateiname innerhalb des Projektordners */
  file: string;
  width: number;
  height: number;
  /** Eigene Anzeigedauer in Millisekunden. Fehlt sie, gilt 1000 / fps des Projekts. */
  durationMs?: number;
};

export type Project = {
  id: string;
  name: string;
  fps: number;
  createdAt: number;
  updatedAt: number;
  frames: Frame[];
};

export const MIN_DURATION_MS = 20;
export const MAX_DURATION_MS = 10000;

/** Anzeigedauer eines Bildes in Millisekunden. */
export const frameDuration = (project: Project, frame: Frame) =>
  frame.durationMs ?? Math.round(1000 / project.fps);

/** Gesamtlänge des Films in Millisekunden. */
export const totalDuration = (project: Project) =>
  project.frames.reduce((sum, f) => sum + frameDuration(project, f), 0);

export const formatSeconds = (ms: number) =>
  `${(ms / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} s`;

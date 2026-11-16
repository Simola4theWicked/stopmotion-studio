export type Frame = {
  id: string;
  /** Dateiname innerhalb des Projektordners */
  file: string;
  width: number;
  height: number;
};

export type Project = {
  id: string;
  name: string;
  fps: number;
  createdAt: number;
  updatedAt: number;
  frames: Frame[];
};

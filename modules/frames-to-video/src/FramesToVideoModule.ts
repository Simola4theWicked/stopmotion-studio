import { NativeModule, requireOptionalNativeModule } from 'expo';

export type FrameSpec = {
  /** file://-URI eines JPEG/PNG */
  uri: string;
  /** Anzeigedauer in Millisekunden */
  durationMs: number;
};

export type EncodeOptions = {
  frames: FrameSpec[];
  /** file://-URI der Zieldatei (.mp4) */
  outputUri: string;
  width: number;
  height: number;
  /** Bildrate des Videos (Android: konstante Rate, Bilder werden wiederholt) */
  fps?: number;
  bitRate?: number;
};

type Events = {
  onProgress: (event: { done: number; total: number }) => void;
};

declare class FramesToVideoModule extends NativeModule<Events> {
  /** Erstellt das Video und gibt die file://-URI zurück. */
  encodeAsync(options: EncodeOptions): Promise<string>;
}

/** `null`, wenn das native Modul fehlt (z. B. in Expo Go). */
export default requireOptionalNativeModule<FramesToVideoModule>('FramesToVideo');

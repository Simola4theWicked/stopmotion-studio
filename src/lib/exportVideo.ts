import { File, Paths } from 'expo-file-system';
import FramesToVideo from '../../modules/frames-to-video';
import { frameUri } from './storage';
import { frameDuration, type Project } from './types';

export type VideoExportOptions = {
  /** Längere Bildkante in Pixeln */
  maxSize?: number;
  onProgress?: (done: number, total: number) => void;
};

export const isVideoExportAvailable = () => FramesToVideo != null;

/** Auf ein Vielfaches von 16 runden – das mögen alle H.264-Encoder. */
const align16 = (n: number) => Math.max(16, Math.round(n / 16) * 16);

export async function exportVideo(project: Project, opts: VideoExportOptions = {}): Promise<File> {
  if (!FramesToVideo) {
    throw new Error(
      'Der MP4-Export braucht die installierte App (APK bzw. Development Build) und funktioniert nicht in Expo Go.',
    );
  }
  const frames = project.frames;
  if (frames.length === 0) throw new Error('Das Projekt hat noch keine Bilder.');

  const maxSize = opts.maxSize ?? 1280;
  const first = frames[0];
  const scale = maxSize / Math.max(first.width, first.height);
  const width = align16(first.width * scale);
  const height = align16(first.height * scale);

  const safeName = project.name.replace(/[^a-z0-9äöüß_-]+/gi, '_') || 'stopmotion';
  const out = new File(Paths.cache, `${safeName}_${Date.now()}.mp4`);

  const sub = FramesToVideo.addListener('onProgress', ({ done, total }) =>
    opts.onProgress?.(done, total),
  );
  try {
    const uri = await FramesToVideo.encodeAsync({
      frames: frames.map((f) => ({
        uri: frameUri(project.id, f),
        durationMs: frameDuration(project, f),
      })),
      outputUri: out.uri,
      width,
      height,
      fps: 30,
      bitRate: 8_000_000,
    });
    return new File(uri);
  } finally {
    sub.remove();
  }
}

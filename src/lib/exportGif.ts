import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import * as jpeg from 'jpeg-js';
import { frameUri } from './storage';
import { frameDuration, type Project } from './types';

export type ExportOptions = {
  /** Breite des GIFs in Pixeln */
  width?: number;
  onProgress?: (done: number, total: number) => void;
};

const nextTick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Rendert alle Frames eines Projekts in ein animiertes GIF und gibt die Datei zurück.
 * Alle Frames werden auf das Seitenverhältnis des ersten Frames skaliert.
 */
export async function exportGif(project: Project, opts: ExportOptions = {}): Promise<File> {
  const frames = project.frames;
  if (frames.length === 0) throw new Error('Das Projekt hat noch keine Bilder.');

  const width = Math.round(opts.width ?? 480);
  const first = frames[0];
  const height = Math.max(1, Math.round((width * first.height) / first.width));

  const gif = GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    const ref = await ImageManipulator.manipulate(frameUri(project.id, frames[i]))
      .resize({ width, height })
      .renderAsync();
    const scaled = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
    const tmp = new File(scaled.uri);
    const decoded = jpeg.decode(await tmp.bytes(), { useTArray: true, formatAsRGBA: true });
    tmp.delete();

    const palette = quantize(decoded.data, 256);
    const index = applyPalette(decoded.data, palette);
    gif.writeFrame(index, decoded.width, decoded.height, {
      palette,
      delay: frameDuration(project, frames[i]),
      repeat: 0,
    });

    opts.onProgress?.(i + 1, frames.length);
    await nextTick(); // UI atmen lassen
  }
  gif.finish();

  const safeName = project.name.replace(/[^a-z0-9äöüß_-]+/gi, '_') || 'stopmotion';
  const out = new File(Paths.cache, `${safeName}_${Date.now()}.gif`);
  out.create({ overwrite: true });
  await out.write(gif.bytes());
  return out;
}

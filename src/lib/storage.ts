import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { Frame, Project } from './types';

/** Maximale Kantenlänge, auf die importierte/aufgenommene Bilder verkleinert werden. */
const MAX_FRAME_SIZE = 1440;

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const rootDir = () => new Directory(Paths.document, 'projects');

const projectDir = (id: string) => new Directory(rootDir(), id);

const metaFile = (id: string) => new File(projectDir(id), 'project.json');

export const frameUri = (projectId: string, frame: Frame) =>
  new File(projectDir(projectId), frame.file).uri;

function ensureDir(dir: Directory) {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

export async function listProjects(): Promise<Project[]> {
  const root = rootDir();
  ensureDir(root);
  const projects: Project[] = [];
  for (const entry of root.list()) {
    if (!(entry instanceof Directory)) continue;
    const meta = new File(entry, 'project.json');
    if (!meta.exists) continue;
    try {
      projects.push(JSON.parse(await meta.text()) as Project);
    } catch {
      // defekte Projektdatei überspringen
    }
  }
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id: string): Promise<Project | null> {
  const meta = metaFile(id);
  if (!meta.exists) return null;
  return JSON.parse(await meta.text()) as Project;
}

export async function saveProject(project: Project): Promise<Project> {
  const updated = { ...project, updatedAt: Date.now() };
  ensureDir(projectDir(project.id));
  const meta = metaFile(project.id);
  if (!meta.exists) meta.create();
  await meta.write(JSON.stringify(updated));
  return updated;
}

export async function createProject(name: string): Promise<Project> {
  const now = Date.now();
  return saveProject({
    id: uid(),
    name,
    fps: 8,
    createdAt: now,
    updatedAt: now,
    frames: [],
  });
}

export function deleteProject(id: string) {
  const dir = projectDir(id);
  if (dir.exists) dir.delete();
}

/**
 * Kopiert ein Bild (Kamera oder Galerie) verkleinert als JPEG in den Projektordner
 * und gibt den neuen Frame zurück.
 */
export async function importImage(
  projectId: string,
  sourceUri: string,
  srcWidth?: number,
  srcHeight?: number,
): Promise<Frame> {
  ensureDir(projectDir(projectId));
  const ctx = ImageManipulator.manipulate(sourceUri);
  if (srcWidth && srcHeight && Math.max(srcWidth, srcHeight) > MAX_FRAME_SIZE) {
    ctx.resize(
      srcWidth >= srcHeight ? { width: MAX_FRAME_SIZE } : { height: MAX_FRAME_SIZE },
    );
  }
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });

  const id = uid();
  const fileName = `${id}.jpg`;
  const target = new File(projectDir(projectId), fileName);
  new File(result.uri).moveSync(target);
  return { id, file: fileName, width: result.width, height: result.height };
}

export function deleteFrameFile(projectId: string, frame: Frame) {
  const file = new File(projectDir(projectId), frame.file);
  if (file.exists) file.delete();
}

export function duplicateFrameFile(projectId: string, frame: Frame): Frame {
  const id = uid();
  const fileName = `${id}.jpg`;
  new File(projectDir(projectId), frame.file).copySync(
    new File(projectDir(projectId), fileName),
  );
  return { ...frame, id, file: fileName };
}

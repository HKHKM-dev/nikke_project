// ffmpeg / ffprobe の薄いラッパ。録画解析ツール（probe / still / diff）が共有する。
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';

export type Probe = {
  codec: string;
  width: number;
  height: number;
  durationSec: number;
  nbFrames: number;
  avgFps: number;
  sizeBytes: number;
};

function parseRatio(value: string | undefined): number {
  if (!value) return 0;
  const [num, den] = value.split('/');
  const n = Number(num);
  const d = den === undefined ? 1 : Number(den);
  return d === 0 ? 0 : n / d;
}

export function ffprobe(file: string): Probe {
  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name,width,height,avg_frame_rate,nb_frames',
      '-show_entries',
      'format=duration',
      '-of',
      'json',
      file,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`ffprobe failed for ${file}: ${result.stderr}`);
  const json = JSON.parse(result.stdout) as {
    streams?: { codec_name?: string; width?: number; height?: number; avg_frame_rate?: string; nb_frames?: string }[];
    format?: { duration?: string };
  };
  const stream = json.streams?.[0];
  if (!stream) throw new Error(`no video stream in ${file}`);
  return {
    codec: stream.codec_name ?? '?',
    width: stream.width ?? 0,
    height: stream.height ?? 0,
    durationSec: Number(json.format?.duration ?? 0),
    nbFrames: Number(stream.nb_frames ?? 0),
    avgFps: parseRatio(stream.avg_frame_rate),
    sizeBytes: statSync(file).size,
  };
}

export async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export type Crop = { x: number; y: number; w: number; h: number };

/** `x,y,w,h` 形式を解釈する（ffmpeg の crop=w:h:x:y とは並びが違うので注意）。 */
export function parseCrop(value: string): Crop {
  const parts = value.split(',').map((v) => Number(v.trim()));
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) {
    throw new Error(`--crop は x,y,w,h 形式で指定する（受け取った値: ${value}）`);
  }
  const [x, y, w, h] = parts as [number, number, number, number];
  return { x, y, w, h };
}

export function cropFilter(crop: Crop): string {
  return `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`;
}

/** ffmpeg を起動し、生バイト列を frameBytes 単位で切り出して順に返す。 */
export async function* rawFrames(args: string[], frameBytes: number): AsyncGenerator<Buffer, void, undefined> {
  const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const failure = new Promise<never>((_resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`ffmpeg exited with ${code}: ${stderr}`));
    });
  });
  failure.catch(() => {});

  let buffer = Buffer.alloc(0);
  for await (const chunk of child.stdout) {
    buffer = Buffer.concat([buffer, chunk as Buffer]);
    while (buffer.length >= frameBytes) {
      yield buffer.subarray(0, frameBytes);
      buffer = buffer.subarray(frameBytes);
    }
  }
  await Promise.race([failure, new Promise<void>((resolve) => child.on('close', () => resolve()))]);
}

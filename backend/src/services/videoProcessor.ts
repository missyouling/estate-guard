import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getDb } from '../db';
import { configs } from '../db/schema';

async function getVideoConfig() {
  const db = getDb();
  const rows = await db.select().from(configs);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    maxWidth: parseInt(map.video_transcode_max_width || '1920', 10),
    bitrate: map.video_transcode_bitrate || '2000k',
  };
}

export function transcodeVideo(
  inputPath: string,
  outputPath: string,
  onProgress: (percent: number) => void,
): Promise<{ success: boolean; error?: string }> {
  return new Promise(async (resolve) => {
    const cfg = await getVideoConfig();
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    const args = [
      '-i', inputPath,
      '-vf', `scale=${cfg.maxWidth}:-2`,
      '-b:v', cfg.bitrate,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ];

    const proc = spawn('ffmpeg', args);

    let duration = 0;

    proc.stderr.on('data', (data: Buffer) => {
      const msg = data.toString();
      const durMatch = msg.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (durMatch) {
        duration = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
      }
      const timeMatch = msg.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (timeMatch && duration > 0) {
        const current = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
        onProgress(Math.round((current / duration) * 100));
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `ffmpeg exited with code ${code}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

export async function extractVideoThumbnail(
  videoPath: string,
  thumbnailPath: string,
): Promise<string> {
  const dir = path.dirname(thumbnailPath);
  fs.mkdirSync(dir, { recursive: true });

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-i', videoPath,
      '-ss', '00:00:01',
      '-vframes', '1',
      '-q:v', '2',
      '-y',
      thumbnailPath,
    ]);

    proc.on('close', (code) => {
      if (code === 0) resolve(thumbnailPath);
      else reject(new Error(`Thumbnail extraction failed with code ${code}`));
    });
  });
}

import { spawnSync } from 'child_process';
import fs from 'fs';

const METADATA_SUPPORTED_VIDEO = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi']);
const METADATA_SUPPORTED_AUDIO = new Set(['mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac']);

export function embedFileMetadata(filePath: string, ext: string, metadata: {
  record_no: number;
  user_name: string;
  category_name: string;
  uploaded_at: string;
}): boolean {
  if (!fs.existsSync(filePath)) return false;

  const title = `NO.${metadata.record_no}`;
  const comment = `证据编号:${metadata.record_no}|上传人:${metadata.user_name}|分类:${metadata.category_name}|上传时间:${metadata.uploaded_at}`;
  const metaTags: Record<string, string> = {};

  if (METADATA_SUPPORTED_VIDEO.has(ext)) {
    metaTags.title = title;
    metaTags.comment = comment;
    metaTags.artist = metadata.user_name;
    metaTags.date = metadata.uploaded_at.slice(0, 10);
  } else if (METADATA_SUPPORTED_AUDIO.has(ext)) {
    metaTags.title = title;
    metaTags.comment = comment;
    metaTags.artist = metadata.user_name;
    metaTags.date = metadata.uploaded_at.slice(0, 10);
  } else {
    return false;
  }

  const args: string[] = ['-y', '-i', filePath];
  for (const [k, v] of Object.entries(metaTags)) {
    args.push('-metadata', `${k}=${v}`);
  }
  args.push('-codec', 'copy', '-movflags', 'use_metadata_tags', filePath + '.tmp');

  const result = spawnSync('ffmpeg', args, { timeout: 30000, stdio: 'pipe' });
  if (result.status !== 0) {
    try { fs.unlinkSync(filePath + '.tmp'); } catch {}
    return false;
  }

  try {
    fs.unlinkSync(filePath);
    fs.renameSync(filePath + '.tmp', filePath);
    return true;
  } catch {
    try { fs.unlinkSync(filePath + '.tmp'); } catch {}
    return false;
  }
}

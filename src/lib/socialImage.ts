// Friends & Stories: prepare a photo for sharing. Decoding + canvas re-encode drops ALL metadata (EXIF, GPS/location,
// camera serials); the result is ≤ 1440 px WebP (or JPEG where WebP can't be encoded) and is metadata-stripped again.
import { decodeImage, draw, toWebpOrJpeg, clean } from './gallery';
import { checkFile, fitWithin, readExif, HEIC_ERROR } from './media';
import { checkSocialImage, SOCIAL_IMG_EDGE } from './social';
import type { Img } from './socialApi';

export interface PreparedImg extends Img { preview: string; hadGps: boolean }
export async function prepareSocialImage(file: Blob & { name?: string }): Promise<PreparedImg> {
  const name = file.name || 'photo.jpg';
  const chk = checkFile({ name, type: file.type, size: file.size });
  if (!chk.ok) throw new Error(chk.error);
  const exif = readExif(new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer()));
  let d;
  try { d = await decodeImage(file); } catch { throw new Error(chk.heic ? HEIC_ERROR : `${name}: this image couldn’t be opened. Try a JPEG or PNG.`); }
  try {
    const dim = fitWithin(d.w, d.h, SOCIAL_IMG_EDGE);
    let blob = await clean(await toWebpOrJpeg(draw(d.src, dim.w, dim.h, undefined, true), 0.84));
    for (let q = 0.76; blob.size > 2.5 * 1024 * 1024 && q > 0.5; q -= 0.08) blob = await clean(await toWebpOrJpeg(draw(d.src, dim.w, dim.h, undefined, true), q));
    const err = checkSocialImage(blob); if (err) throw new Error(err);
    return { blob, w: dim.w, h: dim.h, preview: URL.createObjectURL(blob), hadGps: exif.hasGps };
  } finally { d.close(); }
}

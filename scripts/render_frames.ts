// Render raw JSON frames -> PNGs in parallel-friendly chunks.
// Usage: npx tsx scripts/render_frames.ts <dir> <startInclusive> <endExclusive> [dpr]
import { renderTerminalToImage } from 'ghostty-opentui/image';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const dir = process.argv[2];
  const start = parseInt(process.argv[3] ?? '0', 10);
  const endArg = process.argv[4];
  const dpr = parseInt(process.argv[5] ?? '1', 10);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const end = endArg ? Math.min(parseInt(endArg, 10), files.length) : files.length;
  for (let i = start; i < end; i++) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, files[i]), 'utf8'));
    const png = await renderTerminalToImage(data, { fontSize: 15, devicePixelRatio: dpr });
    fs.writeFileSync(path.join(dir, files[i].replace(/\.json$/, '.png')), png);
    if ((i - start) % 100 === 99) console.log(`rendered ${i - start + 1}/${end - start}`);
  }
  console.log(`done ${start}..${end}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

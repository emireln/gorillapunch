import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const desktop = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(desktop, '..', 'assets', 'logo.svg'));
const output = resolve(desktop, 'build');
await mkdir(output, { recursive: true });
const icon = await sharp(source).resize(512, 512).png().toBuffer();
const icoPng = await sharp(source).resize(256, 256).png().toBuffer();
const tray = await sharp(source).resize(32, 32).png().toBuffer();
const active = await activeTray(source);
await Promise.all([
  writeFile(resolve(output, 'icon.png'), icon),
  writeFile(resolve(output, 'tray-icon.png'), tray),
  writeFile(resolve(output, 'tray-active.png'), active),
  writeFile(resolve(output, 'icon.ico'), ico(icoPng)),
]);

async function activeTray(svg) {
  const badge = Buffer.from('<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg"><circle cx="26" cy="26" r="5" fill="#34d399" stroke="#181225" stroke-width="2"/></svg>');
  return sharp(svg).resize(32, 32).composite([{ input: badge }]).png().toBuffer();
}

function ico(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header.writeUInt8(0, 6); header.writeUInt8(0, 7); header.writeUInt8(0, 8); header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

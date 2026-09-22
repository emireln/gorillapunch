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

// Generate installer sidebar bitmap (pure gradient of the app logo: purple to red, NO logo, NO texts)
const sidebarBmp = await generateSidebarBmp();

await Promise.all([
  writeFile(resolve(output, 'icon.png'), icon),
  writeFile(resolve(output, 'tray-icon.png'), tray),
  writeFile(resolve(output, 'tray-active.png'), active),
  writeFile(resolve(output, 'icon.ico'), ico(icoPng)),
  writeFile(resolve(output, 'installer-sidebar.bmp'), sidebarBmp),
]);

console.log('✅ Generated all desktop and installer assets (clean purple-red gradient sidebar)');

async function activeTray(svg) {
  const badge = Buffer.from('<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg"><circle cx="26" cy="26" r="5" fill="#34d399" stroke="#181225" stroke-width="2"/></svg>');
  return sharp(svg).resize(32, 32).composite([{ input: badge }]).png().toBuffer();
}

async function generateSidebarBmp() {
  const width = 164;
  const height = 314;
  const bgSvg = Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gp-installer-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#7553FF"/>
          <stop offset="100%" stop-color="#E5484D"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#gp-installer-gradient)"/>
    </svg>
  `);
  const raw = await sharp(bgSvg).raw().toBuffer();
  return createBmp(width, height, raw);
}

function createBmp(width, height, rawBuffer) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;
  const buffer = Buffer.alloc(fileSize);

  buffer.write('BM', 0);
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(pixelArraySize, 34);

  let offset = 54;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const srcIndex = (y * width + x) * (rawBuffer.length / (width * height));
      const r = rawBuffer[srcIndex];
      const g = rawBuffer[srcIndex + 1];
      const b = rawBuffer[srcIndex + 2];
      buffer[offset++] = b;
      buffer[offset++] = g;
      buffer[offset++] = r;
    }
    for (let p = 0; p < rowSize - width * 3; p++) buffer[offset++] = 0;
  }
  return buffer;
}

function ico(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header.writeUInt8(0, 6); header.writeUInt8(0, 7); header.writeUInt8(0, 8); header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

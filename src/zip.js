// Small ZIP writer shared by browser downloads and the Node release builder.
// Browsers store files directly; the build can supply deflated data for smaller releases.
const zipEncoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZip(entries, date = new Date()) {
  if (entries.length > 65535) throw new Error('Too many files for this ZIP format.');
  const local = [], central = [], names = new Set();
  let offset = 0, directorySize = 0;
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('/') || entry.name.includes('\\') || entry.name.split('/').some(part => !part || part === '.' || part === '..') || names.has(entry.name)) throw new Error('Invalid or duplicate ZIP filename.');
    names.add(entry.name);
    const name = zipEncoder.encode(entry.name);
    const data = typeof entry.data === 'string' ? zipEncoder.encode(entry.data) : entry.data;
    const payload = entry.compressed || data;
    if (!(data instanceof Uint8Array) || !(payload instanceof Uint8Array)) throw new TypeError('ZIP data must be bytes or text.');
    if (name.length > 65535 || data.length > 0xffffffff || payload.length > 0xffffffff) throw new Error('This file exceeds the ZIP size limit.');
    const crc = crc32(data), method = entry.compressed ? 8 : 0;
    const header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true); view.setUint16(8, method, true);
    view.setUint16(10, dosTime, true); view.setUint16(12, dosDate, true);
    view.setUint32(14, crc, true); view.setUint32(18, payload.length, true); view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true); header.set(name, 30);
    const record = new Uint8Array(46 + name.length), recordView = new DataView(record.buffer);
    recordView.setUint32(0, 0x02014b50, true); recordView.setUint16(4, 20, true); recordView.setUint16(6, 20, true);
    recordView.setUint16(8, 0x0800, true); recordView.setUint16(10, method, true);
    recordView.setUint16(12, dosTime, true); recordView.setUint16(14, dosDate, true);
    recordView.setUint32(16, crc, true); recordView.setUint32(20, payload.length, true); recordView.setUint32(24, data.length, true);
    recordView.setUint16(28, name.length, true); recordView.setUint32(42, offset, true); record.set(name, 46);
    local.push(header, payload); central.push(record);
    offset += header.length + payload.length; directorySize += record.length;
  }
  if (offset + directorySize > 0xffffffff) throw new Error('This archive exceeds the ZIP size limit.');
  const end = new Uint8Array(22), endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true); endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directorySize, true); endView.setUint32(16, offset, true);
  const result = new Uint8Array(offset + directorySize + end.length);
  let cursor = 0;
  for (const part of [...local, ...central, end]) { result.set(part, cursor); cursor += part.length; }
  return result;
}

import { open, readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const LOCAL_FILE_SIGNATURE = 0x04034b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_VERSION = 20;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const DEFLATE_METHOD = 8;
const DIRECTORY_ATTRIBUTE = 0x10;
const MAX_ENTRY_COUNT = 65_535;
const COMPRESSION_LEVEL = 6;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

async function collectEntries(directory, prefix, entries) {
  const items = await readdir(directory, { withFileTypes: true });
  for (const item of items) {
    const path = resolve(directory, item.name);
    const name = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isSymbolicLink()) {
      throw new Error(`发布包不允许符号链接：${name}`);
    }
    if (item.isDirectory()) {
      entries.push({ directory: true, name: `${name}/`, path });
      await collectEntries(path, name, entries);
      continue;
    }
    if (!item.isFile()) {
      throw new Error(`发布包包含不支持的文件类型：${name}`);
    }
    entries.push({ directory: false, name, path });
  }
}

function localHeader(entry, name, method, compressed) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(LOCAL_FILE_SIGNATURE, 0);
  header.writeUInt16LE(ZIP_VERSION, 4);
  header.writeUInt16LE(UTF8_FLAG, 6);
  header.writeUInt16LE(method, 8);
  header.writeUInt16LE(entry.time, 10);
  header.writeUInt16LE(entry.date, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(entry.size, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function centralRecord(entry, name, method, compressed, localOffset) {
  const record = Buffer.alloc(46);
  record.writeUInt32LE(CENTRAL_FILE_SIGNATURE, 0);
  record.writeUInt16LE(ZIP_VERSION, 4);
  record.writeUInt16LE(ZIP_VERSION, 6);
  record.writeUInt16LE(UTF8_FLAG, 8);
  record.writeUInt16LE(method, 10);
  record.writeUInt16LE(entry.time, 12);
  record.writeUInt16LE(entry.date, 14);
  record.writeUInt32LE(entry.crc, 16);
  record.writeUInt32LE(compressed.length, 20);
  record.writeUInt32LE(entry.size, 24);
  record.writeUInt16LE(name.length, 28);
  record.writeUInt16LE(0, 30);
  record.writeUInt16LE(0, 32);
  record.writeUInt16LE(0, 34);
  record.writeUInt16LE(0, 36);
  record.writeUInt32LE(entry.directory ? DIRECTORY_ATTRIBUTE : 0, 38);
  record.writeUInt32LE(localOffset, 42);
  return Buffer.concat([record, name]);
}

/** 用纯 Node 生成 ZIP，避免发布流程依赖 macOS 的 ditto 或系统 unzip。 */
export async function createZipArchiveFromDirectory(source, destination) {
  const root = resolve(source);
  const collected = [];
  await collectEntries(root, '', collected);
  collected.sort((left, right) => left.name.localeCompare(right.name));
  if (collected.length > MAX_ENTRY_COUNT) {
    throw new Error(`ZIP 条目数量不能超过 ${MAX_ENTRY_COUNT}。`);
  }

  const output = await open(resolve(destination), 'w');
  const centralRecords = [];
  let offset = 0;
  try {
    for (const item of collected) {
      const name = Buffer.from(item.name, 'utf8');
      const metadata = await stat(item.path);
      const timestamp = dosTimestamp(metadata.mtime);
      const base = {
        crc: 0,
        date: timestamp.date,
        directory: item.directory,
        size: 0,
        time: timestamp.time,
      };
      let method = STORE_METHOD;
      let compressed = Buffer.alloc(0);
      if (!item.directory) {
        const bytes = await readFile(item.path);
        base.crc = crc32(bytes);
        base.size = bytes.length;
        if (bytes.length > 0) {
          const deflated = deflateRawSync(bytes, { level: COMPRESSION_LEVEL });
          if (deflated.length < bytes.length) {
            method = DEFLATE_METHOD;
            compressed = deflated;
          } else {
            compressed = bytes;
          }
        }
      }
      const header = localHeader(base, name, method, compressed);
      for (const chunk of [header, name, compressed]) {
        await output.write(chunk);
        offset += chunk.length;
      }
      centralRecords.push(
        centralRecord(
          base,
          name,
          method,
          compressed,
          offset - header.length - name.length - compressed.length,
        ),
      );
    }

    const centralStart = offset;
    for (const record of centralRecords) {
      await output.write(record);
      offset += record.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(centralRecords.length, 8);
    end.writeUInt16LE(centralRecords.length, 10);
    end.writeUInt32LE(offset - centralStart, 12);
    end.writeUInt32LE(centralStart, 16);
    end.writeUInt16LE(0, 20);
    await output.write(end);
  } finally {
    await output.close();
  }

  return collected.map((item) => item.name);
}

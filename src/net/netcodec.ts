/**
 * netcodec.ts — TETR.IO NetCodec: bit-level (MSB-first) game-data serializer.
 *
 * Ported from docs/captures/netcodec_deobfuscated.js:
 *   - `Se`  -> NetCodec core (TYPES, DInt, Number codec, Table, Array codec,
 *              Encoder, Decoder, registration tables).
 *   - `ze`  -> ExtensionBase: struct/table/property registration + msgpackr
 *              extension loading (ext types start at 10).
 *   - `Fe`  -> StructBase: fixed+optional+const field structs with a prop table.
 *
 * Wire format notes (exact spec):
 *   - All integer writes are MSB-first bit writes; negative ints are stored as
 *     two's complement in the given bit width.
 *   - Typed entries (Buffer/Double/UInt64/Hex) are realigned to the next byte
 *     boundary before they are written (both on encode finalize and decode).
 *   - DInt: 1 flag bit (0 = min bits, 1 = max bits) then the value in
 *     min/max bits. min/max are bit counts and must be powers of two in size
 *     (2**min / 2**max are the unsigned thresholds).
 */

export const TYPES = {
  Table: 0,
  Array: 1,
  Struct: 2,
  String: 3,
  Buffer: 4,
  Boolean: 5,
  Int: 6,
  UInt: 7,
  DInt: 8,
  Float: 9,
  UFloat: 10,
  Double: 11,
  Number: 12,
  Any: 13,
} as const;
export type TypeId = (typeof TYPES)[keyof typeof TYPES];
export const TYPES_INDEX: (keyof typeof TYPES)[] = Object.keys(TYPES) as (keyof typeof TYPES)[];
export const SUPPORTED_TYPES = new Set(['undefined', 'null', 'boolean', 'number', 'string', 'array']);

/** cla32: number of bits needed to represent v (signed-aware), like the reference. */
export function cla32(v: number): number {
  return v >>> 0 === v
    ? Math.max(32 - Math.clz32(v), 1)
    : Math.max(32 - Math.clz32(~v) + 1, 2);
}

/** GetIntSize: size in 4-bit units (nibbles) needed for v. */
export function getIntSize(v: number): number {
  return Math.ceil(cla32(v) / 4);
}

/** Entry type tags for the Encoder's pending buffer (reference: Le). */
const enum EntryType {
  BUFFER = 1,
  DOUBLE = 2,
  QWORD = 3,
  HEX = 4,
}

interface Entry {
  val: unknown;
  size: number;
  type: EntryType | null;
}

/** MSB-first bit writer over a Buffer (reference: the `n` bitstream class). */
class BitWriter {
  offset = 0;
  constructor(public buffer: Buffer) {}
  seek(bits: number, whence = 0): void {
    this.offset = whence === 0 ? bits : this.offset + bits;
  }
  write(value: number, size: number): void {
    let v = value < 0 ? value + 2 ** size : value;
    for (let i = size - 1; i >= 0; i--) {
      const byteIdx = this.offset >> 3;
      const bitIdx = 7 - (this.offset & 7);
      if (Math.floor(v / 2 ** i) % 2 !== 0) this.buffer[byteIdx] |= 1 << bitIdx;
      else this.buffer[byteIdx] &= ~(1 << bitIdx);
      this.offset++;
    }
  }
}

/** MSB-first bit reader over a Buffer (reference: the `n` bitstream class). */
class BitReader {
  offset = 0;
  constructor(public buffer: Buffer) {}
  get length(): number {
    return this.buffer.length * 8;
  }
  seek(bits: number, whence = 0): void {
    this.offset = whence === 0 ? bits : this.offset + bits;
  }
  read(size: number): number {
    let v = 0;
    for (let i = 0; i < size; i++) {
      const byteIdx = this.offset >> 3;
      const bitIdx = 7 - (this.offset & 7);
      v = v * 2 + ((this.buffer[byteIdx] >> bitIdx) & 1);
      this.offset++;
    }
    return v;
  }
  peek(size: number, offset = this.offset): number {
    const save = this.offset;
    this.offset = offset;
    const v = this.read(size);
    this.offset = save;
    return v;
  }
}

/**
 * DInt: dual-size integer. 1 flag bit selects min (0) or max (1) bit width.
 * `min`/`max` are BIT counts; the thresholds are 2**min / 2**max.
 */
export class DInt {
  /** bit count when flag = 0 */
  readonly minBits: number;
  /** bit count when flag = 1 */
  readonly maxBits: number;
  /** 2**minBits: values >= this need maxBits (unsigned) */
  readonly minSize: number;
  /** 2**maxBits */
  readonly maxSize: number;
  constructor({ min, max }: { min: number; max: number }) {
    this.minBits = min;
    this.maxBits = max;
    this.minSize = 2 ** min;
    this.maxSize = 2 ** max;
  }
  readSize(bit: number | boolean): number {
    return bit ? this.maxBits : this.minBits;
  }
  writeSize(value: number): { bit: boolean; size: number } {
    let bit: boolean;
    if (value >>> 0 === value) {
      bit = this.minSize <= value;
    } else if ((value | 0) === value) {
      bit = -this.minSize / 2 > value;
    } else {
      throw new RangeError(`Float/Double is not supported for DInt: got ${value}`);
    }
    return { bit, size: bit ? this.maxBits : this.minBits };
  }
}

/** Self-sizing number codec (reference: Se.Number). Tag: 3 bits. */
export class NumberCodec {
  static readonly TYPES = { NaN: 0, Infinity: 1, UInt: 2, Int: 3, Double: 4 } as const;
  static encode(e: Encoder, v: number): void {
    const T = NumberCodec.TYPES;
    if (typeof v !== 'number') throw new TypeError(`Attempted to encode ${typeof v} as a number`);
    if (Number.isNaN(v)) {
      e.writeUInt(T.NaN, 3);
      return;
    }
    if (!Number.isFinite(v)) {
      e.writeUInt(T.Infinity, 3);
      e.writeBoolean(v === Number.POSITIVE_INFINITY);
      return;
    }
    if (v >>> 0 === v) {
      const n = getIntSize(v);
      e.writeUInt(T.UInt, 3);
      e.writeUInt(n - 1, 3);
      e.writeUInt(v, 4 * n);
    } else if ((v | 0) === v) {
      const n = getIntSize(v);
      e.writeUInt(T.Int, 3);
      e.writeUInt(n - 1, 3);
      e.writeInt(v, 4 * n);
    } else {
      e.writeUInt(T.Double, 3);
      e.writeDouble(v);
    }
  }
  static decode(e: Decoder): number {
    switch (e.readUInt(3)) {
      case 0:
        return NaN;
      case 1:
        return e.readBoolean() ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      case 2: {
        const n = e.readUInt(3) + 1;
        return e.readUInt(4 * n);
      }
      case 3: {
        const n = e.readUInt(3) + 1;
        return e.readInt(4 * n);
      }
      case 4:
        return e.readDouble();
      default:
        return undefined as unknown as number;
    }
  }
}

/**
 * Table: fixed-size enum. Index 0 is reserved; entries get indices 1..N.
 * In strict mode, unknown values are an error (getkv -> undefined encodes as 0);
 * otherwise index 0 escapes to an Any-encoded value.
 */
export class Table<V = unknown> {
  private readonly _kv = new Map<V, number>();
  private readonly _vk = new Map<number, V>();
  readonly mode: string;
  readonly size: number;
  constructor(entries: Iterable<V> | Map<number, V>, mode = 'strict') {
    this.mode = mode;
    const list: [number, V][] =
      entries instanceof Map
        ? [...entries.entries()]
        : [...(entries as Iterable<V>)].map((v, k) => [k, v] as [number, V]);
    for (const [k, v] of list) {
      this._kv.set(v, k + 1);
      this._vk.set(k + 1, v);
    }
    this.size = Math.max(32 - Math.clz32(this._vk.size), 1);
  }
  getkv(v: V): number | undefined {
    return this._kv.get(v);
  }
  getvk(i: number): V | undefined {
    return this._vk.get(i);
  }
  /** debug helper: index -> value map */
  get struct(): Record<string, V | undefined> {
    const out: Record<string, V | undefined> = {};
    for (const [i, v] of this._vk) out['0x' + i.toString(16).padStart(2, '0')] = v;
    return out;
  }
}

/**
 * Array codec. Modes: 'strict' (elements from a fixed table), 'default'
 * (elements as Any), 'flexible' (unimplemented in the reference).
 * Length is a DInt (default 7/15 bits).
 */
export class ArrayCodec {
  readonly mode: string;
  private readonly _table?: Table;
  private readonly _prop: DInt;
  constructor(mode = 'default', { list, min, max }: { list?: unknown[]; min?: number; max?: number } = {}) {
    this.mode = mode;
    switch (mode) {
      case 'strict':
        this._table = new Table(list ?? []);
        break;
      case 'flexible':
        throw new Error('Flexible mode is not implemented yet');
      default:
        break;
    }
    min ??= 7;
    max ??= 15;
    this._prop = new DInt({ min, max });
  }
  encode(e: Encoder, arr: unknown[]): void {
    e.writeDInt(arr.length, this._prop);
    if (this.mode === 'strict') {
      for (const v of arr) e.writeTable(v, this._table!);
    } else {
      for (const v of arr) e.writeAny(v, this);
    }
  }
  decode(e: Decoder): unknown[] {
    const n = e.readDInt(this._prop);
    const out: unknown[] = [];
    if (this.mode === 'strict') {
      for (let i = 0; i < n; i++) out.push(e.readTable(this._table!));
    } else {
      for (let i = 0; i < n; i++) out.push(e.readAny(this));
    }
    return out;
  }
}

export let SUPPORTED_TYPES_TABLE: Table<string>;
export let DEFAULT_ARRAY: ArrayCodec;
export let DEFAULT_PROP: DInt;

export function initNetCodec(): void {
  SUPPORTED_TYPES_TABLE = new Table(Array.from(SUPPORTED_TYPES));
  DEFAULT_ARRAY = new ArrayCodec();
  DEFAULT_PROP = new DInt({ min: 8, max: 32 });
}
initNetCodec();

/** Packr subset the Encoder needs for nested msgpackr packing (`pack`). */
export interface PackrLike {
  pack(value: unknown): Buffer;
  useBuffer?(buffer: Buffer): void;
  unpack?(buffer: Buffer): unknown;
}

export class Encoder {
  ref = new Map<unknown, number>();
  refid = 0;
  private _buffer: Entry[] = [];
  private _size = 0;
  constructor(
    private readonly _packr: PackrLike | null = null,
    private readonly _packBuffer: Buffer | null = null,
  ) {
    this.ref = new Map();
    this.refid = 0;
  }
  get buffer(): Entry[] {
    return this._buffer;
  }
  get size(): number {
    return this._size;
  }
  get byteLength(): number {
    return Math.ceil(this._size / 8);
  }
  realign(): number {
    this._size += (8 - (this._size % 8)) % 8;
    return this._size;
  }
  private _insert(val: unknown, size: number, type: EntryType | null = null): void {
    if (type) this.realign();
    this._size += size;
    this._buffer.push({ val, size, type });
  }
  writeTable(v: unknown, t: Table): void {
    if (t.mode === 'strict') {
      this._insert(t.getkv(v), t.size);
      return;
    }
    const idx = t.getkv(v);
    if (idx === undefined) {
      this._insert(null, t.size);
      this.writeAny(v);
      return;
    }
    this._insert(idx, t.size);
  }
  writeArray(arr: unknown[], t: ArrayCodec = DEFAULT_ARRAY): void {
    if (t.mode === 'strict') {
      t.encode(this, arr);
      return;
    }
    if (this.ref.has(arr)) {
      this._insert(true, 1);
      this.writeDInt(this.ref.get(arr)!, DEFAULT_PROP);
      return;
    }
    this._insert(false, 1);
    this.ref.set(arr, this.refid++);
    t.encode(this, arr);
  }
  writeStruct(v: unknown, t: { encode(e: Encoder, v: unknown): void }): void {
    t.encode(this, v);
  }
  writeString(s: string, terminate = true): void {
    const b = Buffer.from(terminate ? `${s}\0` : s, 'utf8');
    this._insert(b, 8 * b.byteLength, EntryType.BUFFER);
  }
  writeBuffer(b: Buffer): void {
    this._insert(b, 8 * b.byteLength, EntryType.BUFFER);
  }
  writeBoolean(v: unknown): void {
    this._insert(v ? 1 : 0, 1);
  }
  writeInt(v: number, bits: number): void {
    this._insert(v, bits);
  }
  writeUInt(v: number, bits: number): void {
    this._insert(v, bits);
  }
  writeUInt64(v: bigint): void {
    this._insert(v, 64, EntryType.QWORD);
  }
  writeDInt(v: number, t: DInt): void {
    const s = t.writeSize(v);
    this._insert(s.bit ? 1 : 0, 1);
    this._insert(v, s.size);
  }
  /** Float: 1 sign bit + round(v*scale) in `bits` bits (two's complement if negative). */
  writeFloat(v: number, bits: number, scale: number): void {
    this._insert(v < 0 ? 1 : 0, 1);
    this._insert(Math.round(v * scale), bits);
  }
  writeUFloat(v: number, bits: number, scale: number): void {
    this._insert(Math.round(v * scale), bits);
  }
  writeDouble(v: number): void {
    this._insert(v, 64, EntryType.DOUBLE);
  }
  writeNumber(v: number): void {
    NumberCodec.encode(this, v);
  }
  writeHex(v: string, bytes: number): void {
    this._insert(v, bytes * 8, EntryType.HEX);
  }
  writeAny(v: unknown, t?: ArrayCodec): void {
    const s = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    if (!SUPPORTED_TYPES.has(s)) {
      throw new TypeError(`Type ${s} is not implemented for NetCodec.TYPES.Any`);
    }
    this.writeTable(s, SUPPORTED_TYPES_TABLE);
    switch (s) {
      case 'boolean':
        this.writeBoolean(v);
        break;
      case 'null':
      case 'undefined':
        break;
      case 'number':
        NumberCodec.encode(this, v as number);
        break;
      case 'string':
        this.writeString(v as string);
        break;
      case 'array':
        this.writeArray(v as unknown[], t);
        break;
    }
  }
  writeByType(type: number, v: unknown, ...args: unknown[]): void {
    (this as unknown as Record<string, (...a: unknown[]) => void>)[`write${TYPES_INDEX[type]}`](v, ...args);
  }
  /** Pack a value with the bound msgpackr Packr and embed it (byte-aligned). */
  pack(v: unknown): void {
    if (!this._packr) throw new Error('Encoder.pack requires a Packr');
    if (this._packBuffer && this._packr.useBuffer) this._packr.useBuffer(this._packBuffer);
    const b = this._packr.pack(v);
    this._insert(b, 8 * b.byteLength, EntryType.BUFFER);
  }
  /** Assemble the final buffer: sequential MSB-first writes; typed entries byte-align. */
  finalize(out: Buffer | null = null): Buffer {
    const buf = out ?? Buffer.alloc(this.byteLength);
    const w = new BitWriter(buf);
    for (const { val, size, type } of this._buffer) {
      switch (type) {
        case EntryType.BUFFER: {
          w.offset += (8 - (w.offset % 8)) % 8;
          buf.set(val as Buffer, w.offset / 8);
          w.seek(8 * (val as Buffer).byteLength, 2);
          break;
        }
        case EntryType.DOUBLE: {
          w.offset += (8 - (w.offset % 8)) % 8;
          buf.writeDoubleBE(val as number, w.offset / 8);
          w.seek(64, 2);
          break;
        }
        case EntryType.QWORD: {
          w.offset += (8 - (w.offset % 8)) % 8;
          buf.writeBigUInt64BE(val as bigint, w.offset / 8);
          w.seek(64, 2);
          break;
        }
        case EntryType.HEX: {
          w.offset += (8 - (w.offset % 8)) % 8;
          buf.write(val as string, w.offset / 8, 'hex');
          w.seek(size, 2);
          break;
        }
        default:
          w.write((val as number) ?? 0, size);
      }
    }
    return buf;
  }
}

export class Decoder {
  ref = new Map<number, unknown>();
  refid = 0;
  private readonly _bits: BitReader;
  static readonly _MAX_BITS = Math.log2(Number.MAX_SAFE_INTEGER);
  static readonly _MAX_BITS_SIGNED = 32;
  constructor(buffer: Buffer | Uint8Array, private readonly _unpack: ((byteOffset: number) => unknown) | null = null) {
    // Normalize to a Node Buffer so readDoubleBE/readBigUInt64BE/toString etc. are available
    // (msgpackr ext data arrives as a Uint8Array).
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    this._bits = new BitReader(buf);
    this.ref = new Map();
    this.refid = 0;
  }
  get length(): number {
    return this._bits.length;
  }
  get offset(): number {
    return this._bits.offset;
  }
  set offset(v: number) {
    this._bits.offset = v;
  }
  get buffer(): Buffer {
    return this._bits.buffer;
  }
  get byteOffset(): number {
    return Math.ceil(this.offset / 8);
  }
  realign(): void {
    this.offset = 8 * this.byteOffset;
  }
  private _read(size: number): number {
    return this._bits.read(size);
  }
  private _read_signed(size: number): number {
    const s = Decoder._MAX_BITS_SIGNED - size;
    return (this._read(size) << s) >> s;
  }
  readTable<V>(t: Table<V>): V | undefined {
    const size = t.size;
    if (this.peek(size) !== 0) return t.getvk(this._read(size));
    this.seek(size, 2);
    return this.readAny() as V | undefined;
  }
  readArray(t: ArrayCodec = DEFAULT_ARRAY): unknown {
    if (t.mode === 'strict') return t.decode(this);
    if (this._read(1)) return this.ref.get(this.readDInt(DEFAULT_PROP));
    const arr: unknown[] = [];
    this.ref.set(this.refid++, arr);
    arr.push(...(t.decode(this) as unknown[]));
    return arr;
  }
  readStruct<T>(t: { decode(e: Decoder): T }): T {
    return t.decode(this);
  }
  readString(length?: number): string {
    const start = this.byteOffset;
    let end: number;
    if (typeof length === 'number') {
      end = start + length;
      this.seek(8 * end);
    } else {
      end = this.buffer.indexOf(0, start);
      this.seek(8 * (end + 1));
    }
    return this.buffer.toString('utf8', start, end);
  }
  readBuffer(length: number): Buffer {
    const start = this.byteOffset;
    const end = start + length;
    this.seek(8 * end);
    return this.buffer.subarray(start, end);
  }
  readBoolean(): boolean {
    return !!this._read(1);
  }
  readInt(bits: number): number {
    if (bits > Decoder._MAX_BITS_SIGNED) {
      throw new RangeError(`${bits} of bits is not supported for signed values, max is ${Decoder._MAX_BITS_SIGNED}`);
    }
    return this._read_signed(bits);
  }
  readUInt(bits: number): number {
    if (bits > Decoder._MAX_BITS) {
      throw new RangeError(`${bits} of bits is not supported, max is ${Decoder._MAX_BITS}`);
    }
    return this._read(bits);
  }
  readUInt64(): bigint {
    const e = this.byteOffset;
    this.seek(8 * e + 64);
    return this.buffer.readBigUInt64BE(e);
  }
  readDInt(t: DInt, signed = false): number {
    const s = t.readSize(!!this._read(1));
    return signed ? this._read_signed(s) : this._read(s);
  }
  /** Float: peek sign; if set read (bits+1) signed, else skip a 0 bit and read bits unsigned. */
  readFloat(bits: number, scale: number): number {
    return this.peek(1)
      ? this._read_signed(bits + 1) / scale
      : (this.seek(1, 2), this._read(bits) / scale);
  }
  readUFloat(bits: number, scale: number): number {
    return this._read(bits) / scale;
  }
  readDouble(): number {
    const e = this.byteOffset;
    this.seek(8 * e + 64);
    return this.buffer.readDoubleBE(e);
  }
  readNumber(): number {
    return NumberCodec.decode(this);
  }
  readHex(bytes: number): string {
    const start = this.byteOffset;
    const end = start + bytes;
    this.seek(8 * end);
    return this.buffer.toString('hex', start, end);
  }
  readAny(t?: ArrayCodec): unknown {
    switch (this.readTable(SUPPORTED_TYPES_TABLE)) {
      case 'boolean':
        return this.readBoolean();
      case 'null':
        return null;
      case 'undefined':
        return undefined;
      case 'number':
        return NumberCodec.decode(this);
      case 'string':
        return this.readString();
      case 'array':
        return this.readArray(t);
      default:
        return undefined;
    }
  }
  readByType(type: number, ...args: unknown[]): unknown {
    return (this as unknown as Record<string, (...a: unknown[]) => unknown>)[`read${TYPES_INDEX[type]}`](...args);
  }
  peek(size: number, offset?: number): number {
    return this._bits.peek(size, offset);
  }
  peekTable<V>(t: Table<V>, offset = this.offset): V | undefined {
    return t.getvk(this.peek(t.size, offset));
  }
  peekDInt(t: DInt, offset = this.offset): number {
    return this.peek(t.readSize(!!this.peek(1, offset)), offset + 1);
  }
  seek(bits: number, whence?: number): void {
    this._bits.seek(bits, whence);
  }
  /** Realign, then msgpackr-unpack the remaining bytes via the bound unpacker. */
  unpack(): unknown {
    this.realign();
    if (!this._unpack) throw new Error('Decoder.unpack requires an unpack callback');
    return this._unpack(this.byteOffset);
  }
}

export interface AddExtensionOptions {
  /** allocate a reusable 64K pack buffer for this class */
  ownBuffer?: boolean;
}

interface ExtensionClass {
  name: string;
  EXTENSION_TYPE?: number;
  BUFFER?: Buffer;
  decode(e: Decoder): unknown;
  new (...args: never[]): { encode(e: Encoder): Buffer | void };
}

/**
 * ExtensionBase (reference: ze). Static registration system:
 * AddExtension registers a class in the shared LIST; LoadExtensions then
 * registers every listed class as a msgpackr extension type starting at 10.
 */
export class ExtensionBase {
  static _MAX_BUFFER = 65536;
  static _LIST: Record<string, ExtensionClass> = {};
  static get LIST(): Record<string, ExtensionClass> {
    return ExtensionBase._LIST;
  }
  static AddExtension<T extends ExtensionClass>(cls: T, opts: AddExtensionOptions = {}): void {
    ExtensionBase._LIST[cls.name] = cls;
    if (opts.ownBuffer) cls.BUFFER = Buffer.alloc(ExtensionBase._MAX_BUFFER);
  }
  static AddTable(name: string, entries: Iterable<unknown> | Map<number, unknown>, mode?: string): void {
    (this as unknown as Record<string, unknown>)[`$$${name}`] = new Table(entries, mode);
  }
  static AddProperty(name: string, prop: { min: number; max: number }): void {
    (this as unknown as Record<string, unknown>)[`$${name}`] = new DInt(prop);
  }
  /**
   * Register all AddExtension'd classes as msgpackr extension types,
   * numbered from 10 in registration order (reference: ze.LoadExtensions).
   */
  static LoadExtensions(packr: {
    addExtension(ext: {
      Class: ExtensionClass;
      type: number;
      pack(value: unknown): Buffer | void;
      unpack(buf: Buffer): unknown;
    }): void;
    pack(value: unknown): Buffer;
    useBuffer?(buffer: Buffer): void;
    unpack(buffer: Buffer): unknown;
  }): void {
    let type = 10;
    for (const cls of Object.values(ExtensionBase._LIST)) {
      cls.EXTENSION_TYPE = type++;
      packr.addExtension({
        Class: cls,
        type: cls.EXTENSION_TYPE,
        pack(value: unknown) {
          return (value as { encode(e: Encoder): Buffer | void }).encode(new Encoder(packr, cls.BUFFER ?? null));
        },
        unpack(buf: Buffer) {
          return cls.decode(new Decoder(buf, (off: number) => packr.unpack(buf.subarray(off))));
        },
      });
    }
  }
}

export type StructFieldMode = 'constant' | 'fixed' | 'optional';
export interface StructField {
  mode: StructFieldMode;
  type: number;
  size?: unknown;
  value?: unknown;
}

/**
 * StructBase (reference: Fe). Struct = fixed fields (in declaration order),
 * then optional fields (each prefixed by its name in the `$$prop` table),
 * terminated by `$$prop.size` zero bits. Const fields are never written,
 * they are just attached on decode.
 */
export class StructBase extends ExtensionBase {
  declare static $$prop: Table<string>;
  static _fixFields = new Map<string, { type: number; size: unknown }>();
  static _optFields = new Map<string, { type: number; size: unknown }>();
  static _cstFields = new Map<string, unknown>();
  static AddStructure(fields: Record<string, StructField>): void {
    this._fixFields = new Map();
    this._optFields = new Map();
    this._cstFields = new Map();
    for (const [name, { mode, type, size, value }] of Object.entries(fields)) {
      switch (mode) {
        case 'constant':
          this._cstFields.set(name, value);
          break;
        case 'fixed':
          this._fixFields.set(name, { type, size });
          break;
        case 'optional':
          this._optFields.set(name, { type, size });
          break;
        default:
          throw new Error(`Unknown struct field mode: ${mode}`);
      }
    }
    this.AddTable('prop', Array.from(this._optFields.keys()));
  }
  static encode(e: Encoder, v: Record<string, unknown>): void {
    for (const [name, { type, size }] of this._fixFields.entries()) e.writeByType(type, v[name], size);
    for (const [name, { type, size }] of this._optFields.entries()) {
      if (v[name] === undefined) continue;
      if (type === TYPES.DInt && v[name] === null) continue;
      e.writeTable(name, this.$$prop);
      e.writeByType(type, v[name], size);
    }
    e.writeUInt(0, this.$$prop.size);
  }
  static decode(e: Decoder): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const propSize = this.$$prop.size;
    for (const [name, { type, size }] of this._fixFields.entries()) out[name] = e.readByType(type, size);
    for (let p = e.peek(propSize); p !== 0; p = e.peek(propSize)) {
      const name = e.readTable(this.$$prop)!;
      const field = this._optFields.get(name);
      if (!field) throw new Error(`Unknown optional struct field: ${name}`);
      out[name] = e.readByType(field.type, field.size);
    }
    e.seek(propSize, 2);
    for (const [name, value] of this._cstFields.entries()) out[name] = value;
    return out;
  }
}

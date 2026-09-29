import { describe, expect, it } from 'vitest';
import {
  STAT2,
  STAT3,
  decodeStat1,
  decodeStat2,
  decodeStat3,
  decodeString,
  decodeTemp,
  encodeRegister,
  encodeTarget,
  encodeU16,
} from './protocol';

const view = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);
const hex = (a: Uint8Array) => Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(' ');

describe('Volcano protocol codec (worked examples)', () => {
  it('encodes the target temperature as uint32 LE deci-°C', () => {
    expect(hex(encodeTarget(185))).toBe('3a 07 00 00');
    expect(hex(encodeTarget(300))).toBe('fc 08 00 00'); // clamped to 230 °C
    expect(hex(encodeTarget(10))).toBe('90 01 00 00'); // clamped to 40 °C
  });

  it('encodes auto-off and brightness as uint16 LE', () => {
    expect(hex(encodeU16(3600))).toBe('10 0e');
    expect(hex(encodeU16(70))).toBe('46 00');
  });

  it('uses the set/clear convention for settings registers', () => {
    expect(hex(encodeRegister(STAT2.FAHRENHEIT, true))).toBe('00 02 01 00');
    expect(hex(encodeRegister(STAT2.FAHRENHEIT, false))).toBe('00 02 00 00');
    expect(hex(encodeRegister(STAT3.VIBRATION_DISABLED, true))).toBe('00 04 01 00');
    expect(hex(encodeRegister(STAT2.DISPLAY_ON_COOLING_DISABLED, true))).toBe('00 10 01 00');
  });

  it('decodes temperatures and the invalid sentinel', () => {
    expect(decodeTemp(view([0x6c, 0x07]))).toBe(190);
    expect(decodeTemp(view([0xff, 0xff]))).toBeUndefined();
  });

  it('decodes PRJSTAT1 live values observed on real hardware', () => {
    expect(decodeStat1(0x0000)).toMatchObject({ heaterOn: false, pumpOn: false, ready: false });
    expect(decodeStat1(0x0023)).toMatchObject({ heaterOn: true, pumpOn: false, ready: false });
    expect(decodeStat1(0x0623)).toMatchObject({ heaterOn: true, ready: true });
    expect(decodeStat1(0x3000)).toMatchObject({ heaterOn: false, pumpOn: true });
    expect(decodeStat1(0x0010).error).toBe(0x0010);
  });

  it('decodes display and vibration registers', () => {
    expect(decodeStat2(0x0200)).toMatchObject({ fahrenheit: true, displayOnCooling: true });
    expect(decodeStat2(0x1000)).toMatchObject({ fahrenheit: false, displayOnCooling: false });
    expect(decodeStat3(0x0400).vibration).toBe(false);
    expect(decodeStat3(0x0001).vibration).toBe(true);
  });

  it('decodes padded ASCII strings', () => {
    expect(decodeString(view([0x56, 0x30, 0x31, 0x2e, 0x30, 0x33, 0x20, 0x00]))).toBe('V01.03');
  });
});

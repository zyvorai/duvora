import { describe, expect, it } from 'vitest';
import { errorMessage } from '../api';
import { scoreTone, healthTone, severityTone } from '../components/kit';
import { layout } from '../pages/Topology';
import { ago, metric, parsePorts, sourceLabel } from './format';

describe('format', () => {
  it('labels sources', () => {
    expect(sourceLabel('linux-pci')).toBe('Linux PCI');
    expect(sourceLabel('other')).toBe('other');
  });

  it('keeps missing metrics unknown', () => {
    expect(metric(undefined, 'Gb/s')).toBe('Unknown');
    expect(metric(80, 'Gb/s')).toBe('80 Gb/s');
    expect(metric(43.27, '°C')).toBe('43.3 °C');
  });

  it('formats relative time', () => {
    expect(ago(100, 130)).toBe('30s ago');
    expect(ago(0, 7200)).toBe('2h ago');
  });

  it('parses ports', () => {
    expect(parsePorts('')).toEqual([]);
    expect(parsePorts('443, 8443')).toEqual([443, 8443]);
    expect(parsePorts('0')).toBeNull();
    expect(parsePorts('http')).toBeNull();
  });
});

describe('tones', () => {
  it('maps scores, health, and severity', () => {
    expect(scoreTone(95)).toBe('ok');
    expect(scoreTone(60)).toBe('warn');
    expect(scoreTone(10)).toBe('bad');
    expect(scoreTone(null)).toBe('idle');
    expect(healthTone('stale')).toBe('bad');
    expect(severityTone('critical')).toBe('bad');
  });
});

describe('api errors', () => {
  it('unwraps the JSON envelope', () => {
    expect(errorMessage('{"error":"Wrong username or password."}')).toBe('Wrong username or password.');
    expect(errorMessage('plain')).toBe('plain');
  });
});

describe('topology layout', () => {
  it('places each kind in its own column', () => {
    const geo = layout({
      nodes: [
        { id: 'site:a', kind: 'site', label: 'a' },
        { id: 'host:a/h', kind: 'host', label: 'h' },
        { id: 'dpu:d', kind: 'dpu', label: 'd' },
      ],
      edges: [],
    });
    expect(geo.pos['site:a'].x).toBeLessThan(geo.pos['host:a/h'].x);
    expect(geo.pos['host:a/h'].x).toBeLessThan(geo.pos['dpu:d'].x);
  });
});

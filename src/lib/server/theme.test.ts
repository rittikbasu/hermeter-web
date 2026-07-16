import { describe, expect, it } from 'vitest';
import { createTheme } from './theme';

describe('createTheme', () => {
  it('derives a stable palette and avatar seed from supplied entropy', () => {
    expect(createTheme(new Uint32Array([2, 35]))).toEqual({
      primaryColor: 'purple',
      avatarSeed: 'hermeter-2-z'
    });
  });
});

const PRIMARY_COLORS = ['green', 'blue', 'purple', 'pink', 'orange', 'red'] as const;

export type PrimaryColor = (typeof PRIMARY_COLORS)[number];

export function createTheme(
  entropy: Uint32Array = crypto.getRandomValues(new Uint32Array(2))
): { primaryColor: PrimaryColor; avatarSeed: string } {
  const colorSeed = entropy[0] ?? 0;
  const avatarSeed = entropy[1] ?? 0;
  return {
    primaryColor: PRIMARY_COLORS[colorSeed % PRIMARY_COLORS.length],
    avatarSeed: `hermeter-${colorSeed.toString(36)}-${avatarSeed.toString(36)}`
  };
}

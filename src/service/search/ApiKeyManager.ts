export function parseApiKeys(...values: Array<string | undefined>): string[] {
  const keys = values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .flatMap((value) => value.split(/[,\s]+/))
    .map((key) => key.trim())
    .filter((key) => key.length > 0);

  return [...new Set(keys)];
}

export function getApiKeys(envNames: string[], directValue?: string): string[] {
  const envValues = envNames.map((envName) => process.env[envName]);
  return parseApiKeys(directValue, ...envValues);
}

export class ApiKeyRoundRobin {
  private keys: string[];
  private index = 0;

  constructor(keys: string[]) {
    this.keys = keys;
  }

  next(): string | null {
    if (this.keys.length === 0) return null;
    const key = this.keys[this.index];
    this.index = (this.index + 1) % this.keys.length;
    return key;
  }
}

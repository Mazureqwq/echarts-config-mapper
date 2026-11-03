export function parseTsv(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.map((line) => line.split("\t"));
}

export function serializeTsv(matrix: string[][]): string {
  return matrix.map((row) => row.join("\t")).join("\n");
}

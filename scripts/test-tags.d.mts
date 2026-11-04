export interface TagDefinition {
  name: string;
  description: string;
}

export interface TestSelection {
  all: boolean;
  tags: string[];
  unit: boolean;
  e2e: boolean;
  vitestFilter: string;
  playwrightGrep: string;
}

export const TAGS: TagDefinition[];
export const SOURCE_TAGS: [pattern: string, tags: string[]][];
export function declaredTags(source: string): string[];
export function tagsForFile(file: string, read?: (file: string) => string[]): string[];
export function selectTests(files: string[], read?: (file: string) => string[]): TestSelection;
export function changedFiles(base?: string): string[];
export function findProblems(): string[];

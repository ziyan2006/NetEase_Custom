import content from "../content/archives.json" with { type: "json" };
import english from "../content/archives.en.json" with { type: "json" };
import { language, localeEvent } from "./i18n";
import { isDjPrototype } from "./wallpaper";
import { djContent } from "./dj-records";

export interface ArchiveRecord {
  id: string;
  title: string;
  en: string;
  department: string;
  category: string;
  date: string;
  lead: string;
  clearance: string;
  abstract: string;
  findings: string[];
  source: string;
  artist?: string;
  album?: string;
  cover?: string;
}

// Preserve record object identities and array indices used by the live scene.
// Navigation always uses the canonical source; translated labels are display data.
const activeContent: { records: ArchiveRecord[]; categories: string[]; columns: string[] } = isDjPrototype ? djContent : content;
const activeEnglish: typeof activeContent = isDjPrototype ? djContent : english;
export const records: ArchiveRecord[] = activeContent.records.map((record, index) =>
  Object.defineProperties({}, Object.fromEntries(Object.keys(record).map(key => [key, {
    enumerable: true,
    get: () => (language() === "en-US" ? activeEnglish.records[index] : record)[key as keyof ArchiveRecord],
  }]))) as ArchiveRecord,
);
const categorySets = [["全部档案", ...activeContent.categories], ["All archives", ...activeEnglish.categories]];
export const categories = [...categorySets[0]];
export const archiveColumns = [...activeContent.columns];
export const categoryIndex = (value: string) => Math.max(...categorySets.map(set => set.indexOf(value)));
window.addEventListener(localeEvent, () => {
  categories.splice(0, categories.length, ...categorySets[language() === "en-US" ? 1 : 0]);
  archiveColumns.splice(0, archiveColumns.length, ...(language() === "en-US" ? activeEnglish.columns : activeContent.columns));
});

export function columnFiles(lane: number) {
  return activeContent.records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.category === activeContent.columns[lane])
    .map(({ index }) => index);
}
export function fileLocation(index: number) {
  const lane = activeContent.columns.indexOf(activeContent.records[index].category);
  const row = 12 + columnFiles(lane).indexOf(index);
  return { lane, row, slot: lane * 32 + row };
}
export function fileAtSlot(slot: number) {
  const files = columnFiles(Math.floor(slot / 32));
  return files[Math.max(0, Math.min(files.length - 1, (slot % 32) - 12))];
}

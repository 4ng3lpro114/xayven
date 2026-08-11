import "server-only";
import type { Locale } from "./config";
import type { Dictionary } from "./dictionary";
import { es } from "./dictionaries/es";
import { en } from "./dictionaries/en";

const dictionaries: Record<Locale, Dictionary> = { es, en };

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale];
}

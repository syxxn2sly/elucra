import { VACCINE_CATALOG } from "./vaccine-data";

export interface TravelDestinationOption {
  id: string;
  country: string;
  flag: string;
  cdcSlug: string;
  localVaccineIds: string[];
}

type RestCountryResponse = {
  name?: { common?: string };
  cca2?: string;
  flag?: string;
};

const CDC_SLUG_OVERRIDES: Record<string, string> = {
  "Cabo Verde": "cape-verde",
  "Côte d'Ivoire": "ivory-coast",
  "Curaçao": "curacao",
  "Democratic Republic of the Congo": "democratic-republic-of-the-congo",
  "Republic of the Congo": "republic-of-the-congo",
  "South Korea": "south-korea",
  "North Korea": "north-korea",
  "Taiwan": "taiwan",
  "United Kingdom": "united-kingdom",
  "United States": "united-states",
  "Vatican City": "vatican-city",
};

const LOCAL_GUIDANCE: Record<string, string[]> = {
  India: ["hep_a", "typhoid", "hep_b", "covid", "flu"],
  Pakistan: ["hep_a", "typhoid", "hep_b", "polio", "covid"],
  Bangladesh: ["hep_a", "typhoid", "hep_b", "japanese_encephalitis", "covid"],
  Nigeria: ["yellow_fever", "hep_a", "typhoid", "meningococcal", "covid"],
  Brazil: ["yellow_fever", "hep_a", "typhoid", "covid"],
  Thailand: ["hep_a", "typhoid", "japanese_encephalitis", "covid"],
  Mexico: ["hep_a", "typhoid", "covid"],
  Indonesia: ["hep_a", "typhoid", "japanese_encephalitis", "covid"],
  Kenya: ["yellow_fever", "hep_a", "typhoid", "covid"],
  Philippines: ["hep_a", "typhoid", "japanese_encephalitis", "covid"],
};

const FALLBACK_DESTINATIONS: TravelDestinationOption[] = Object.keys(LOCAL_GUIDANCE).map((country) => ({
  id: country.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  country,
  flag: "🌍",
  cdcSlug: country.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  localVaccineIds: LOCAL_GUIDANCE[country] ?? [],
}));

function cdcSlugFor(country: string): string {
  return CDC_SLUG_OVERRIDES[country] ?? country.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Fetches the free global country directory. CDC remains the live clinical source. */
export async function fetchTravelDestinations(): Promise<TravelDestinationOption[]> {
  try {
    const response = await fetch("https://restcountries.com/v3.1/all?fields=name,cca2,flag");
    if (!response.ok) throw new Error("Country directory unavailable");
    const countries = (await response.json()) as RestCountryResponse[];
    const parsed = countries.map((item): TravelDestinationOption | null => {
      const country = item.name?.common?.trim();
      if (!country) return null;
      return { id: item.cca2?.toLowerCase() ?? cdcSlugFor(country), country, flag: item.flag ?? "🌍", cdcSlug: cdcSlugFor(country), localVaccineIds: LOCAL_GUIDANCE[country] ?? [] };
    }).filter((item): item is TravelDestinationOption => item !== null);
    return parsed.sort((a, b) => a.country.localeCompare(b.country));
  } catch {
    return FALLBACK_DESTINATIONS;
  }
}

export function cdcDestinationUrl(destination: TravelDestinationOption): string {
  return `https://wwwnc.cdc.gov/travel/destinations/traveler/none/${encodeURIComponent(destination.cdcSlug)}`;
}

export function localTravelVaccines(destination: TravelDestinationOption) {
  return destination.localVaccineIds.map((id) => VACCINE_CATALOG.find((vaccine) => vaccine.id === id)).filter((vaccine): vaccine is (typeof VACCINE_CATALOG)[number] => Boolean(vaccine));
}

/**
 * place lookup for appointment locations.
 *
 * Uses Photon (photon.komoot.io), an OpenStreetMap-backed geocoder that needs
 * no API key and is explicitly built for type-ahead. Nominatim, the other
 * obvious OSM option, forbids autocomplete in its usage policy, so it is not a
 * substitute here.
 *
 * Results are place names — clinics, hospitals, pharmacies — rather than raw
 * addresses, which is what someone actually types when booking an appointment.
 *
 * Attribution: data © OpenStreetMap contributors (ODbL). If this ever becomes
 * heavily used, Photon is open source and can be self-hosted; the public
 * instance is a courtesy and should not be hammered.
 */

const PHOTON_ENDPOINT = "https://photon.komoot.io/api/";
const GEOAPIFY_ENDPOINT = "https://api.geoapify.com/v1/geocode/autocomplete";

/**
 * Geoapify is used instead of Photon when a key is present.
 *
 * It ranks better and offers country filtering and location bias, but it needs
 * an account and its free tier is capped at 3,000 requests a day — so Photon
 * stays the default and nothing has to be signed up for to make the feature
 * work. Set EXPO_PUBLIC_GEOAPIFY_KEY to switch; the same caveat applies as to
 * the Anthropic key, which is that an EXPO_PUBLIC_ value ships inside the app
 * bundle and can be read out of it.
 */
const GEOAPIFY_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_KEY;

/** Photon needs a couple of characters before it returns anything useful. */
export const MIN_QUERY_LENGTH = 3;

interface PhotonProperties {
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  state?: string;
  country?: string;
  postcode?: string;
  osm_key?: string;
}

/**
 * Build the one-line label shown in the list.
 *
 * Street number and street are joined tightly ("412 Grove Street") while the
 * rest are comma-separated, so a result reads the way an address is written
 * rather than as a list of fields.
 */
/**
 * A found place, kept in parts.
 *
 * The name and the address are wanted separately — a clinic record has a field
 * for each — so flattening to one string here would throw away information the
 * lookup already has and force the caller to guess where the name ends.
 */
export interface PlaceResult {
  /** One line, for showing in a list. */
  label: string;
  /** The place's own name, e.g. "Copper Ridge Medical Centre". Empty for a plain address. */
  name: string;
  /** Street, city and region, without the name. */
  address: string;
}

const dedupe = (parts: (string | undefined)[]): string[] =>
  parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    // A named place often repeats its own street or city; drop the duplicates.
    .filter((part, index, all) => all.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index);

function toPlace(props: PhotonProperties & { formatted?: string; address_line1?: string; address_line2?: string }): PlaceResult {
  const street = [props.housenumber, props.street].filter(Boolean).join(" ");
  const name = (props.name ?? "").trim();
  const address = dedupe([street || props.address_line2, props.city, props.state, props.postcode]).join(", ");
  const label = props.formatted?.trim() || dedupe([name, street, props.city, props.state]).join(", ");
  return { label, name, address };
}

/**
 * Search for a place by name.
 *
 * Returns [] rather than throwing on any failure: an appointment location is
 * free text, and a lookup that cannot reach the network should quietly stop
 * offering suggestions rather than block someone from typing their clinic in.
 *
 * Pass an AbortSignal so a keystroke can cancel the request it superseded.
 */
export interface Coords {
  latitude: number;
  longitude: number;
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  near?: Coords | null,
): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];

  // Bias towards a point when we have one. This is the whole value of knowing
  // where the user is: "lifelabs" unbiased returns Ottawa, Kanata and Vancouver,
  // and biased returns four branches in their own city. The coordinates are used
  // for ranking only — never stored, and never written into the field.
  const bias = GEOAPIFY_KEY
    ? near ? `&bias=proximity:${near.longitude},${near.latitude}` : ""
    : near ? `&lat=${near.latitude}&lon=${near.longitude}` : "";

  const url = GEOAPIFY_KEY
    ? `${GEOAPIFY_ENDPOINT}?text=${encodeURIComponent(trimmed)}&limit=5&format=geojson&apiKey=${GEOAPIFY_KEY}${bias}`
    : `${PHOTON_ENDPOINT}?q=${encodeURIComponent(trimmed)}&limit=5&lang=en${bias}`;

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      features?: { properties?: PhotonProperties & { formatted?: string; address_line1?: string; address_line2?: string } }[];
    };

    const places = (data.features ?? [])
      .map((feature) => toPlace(feature.properties ?? {}))
      .filter((place) => place.label.length > 0);

    return places
      .filter((place, index) => places.findIndex((other) => other.label === place.label) === index)
      .slice(0, 5);
  } catch {
    return [];
  }
}

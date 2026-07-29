/**
 * CLAIRITY — place lookup for appointment locations.
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
function toLabel(props: PhotonProperties): string {
  const street = [props.housenumber, props.street].filter(Boolean).join(" ");
  return [props.name, street, props.city, props.state]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    // A named place often repeats its own street or city; drop the duplicates.
    .filter((part, index, all) => all.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index)
    .join(", ");
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
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<string[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];

  const url = GEOAPIFY_KEY
    ? `${GEOAPIFY_ENDPOINT}?text=${encodeURIComponent(trimmed)}&limit=5&format=geojson&apiKey=${GEOAPIFY_KEY}`
    : `${PHOTON_ENDPOINT}?q=${encodeURIComponent(trimmed)}&limit=5&lang=en`;

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      features?: { properties?: PhotonProperties & { formatted?: string } }[];
    };

    const labels = (data.features ?? [])
      .map((feature) => {
        const props = feature.properties ?? {};
        // Geoapify hands back a ready-made one-liner; Photon returns parts.
        return props.formatted?.trim() || toLabel(props);
      })
      .filter((label) => label.length > 0);

    return labels.filter((label, index) => labels.indexOf(label) === index).slice(0, 5);
  } catch {
    return [];
  }
}

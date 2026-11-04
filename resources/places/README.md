# City suggestions and country labels

City data © [GeoNames](https://www.geonames.org/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source: [cities500.zip](https://download.geonames.org/export/dump/cities500.zip), with [admin1CodesASCII.txt](https://download.geonames.org/export/dump/admin1CodesASCII.txt) for regions. cities500 covers settlements with population above 500 and administrative seats; it is not a complete list of every settlement. Unknown names can be checked through the separate OpenAI validation path.

This transformed dataset includes native names, normalized aliases and population ordering, adds country/region disambiguation, and merges identical display values under the existing string city API. The bundled version contains 230,662 suggestions. GeoNames attribution is on the public `/legal` page; city pickers stay free of source captions.

Country labels derive from Unicode CLDR JSON `cldr-localenames-full/main/{ru,en}/territories.json`, under [Unicode License v3](https://www.unicode.org/license.txt); see `UNICODE-LICENSE.txt`. Existing WIRING country identifiers are preserved. Source hashes are recorded in `manifest.json`.

Rebuild after downloading the inputs into one directory (including admin1CodesASCII.txt):

```sh
python3 scripts/build_world_places.py /path/cities500.zip /path/countries-ru.json /path/countries-en.json
```

Runtime needs only the generated gzip and country JSON, not the source downloads, a new dependency, or an external geocoder. Keep the manifest and licensing files alongside them.

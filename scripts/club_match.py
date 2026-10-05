"""Matching club names across sources, for the international squads.

Wikipedia squad tables give each player's club as a wikilink ("Everton F.C.",
shown as "Everton") and the club's league country as a FIFA code ("ENG").
This module turns those into:
  * the league country's name (FIFA_COUNTRIES),
  * the FixtureShark club (public.teams: canonical/display names and every
    alias we hold from football-data.co.uk, FPL and the other feeds), and
  * the ClubElo club (api.clubelo.com: short names like "Man City").
Matching is by normalised name within the same country, then hand aliases
(CLUBELO_ALIASES / SITE_ALIASES) for the few that normalising can't reach.
"""

from __future__ import annotations

import re
import unicodedata

# FIFA trigrammes (as Wikipedia's clubnat uses them) -> country name.
FIFA_COUNTRIES = {
    "AFG": "Afghanistan", "AIA": "Anguilla", "ALB": "Albania", "ALG": "Algeria", "AND": "Andorra", "ANG": "Angola",
    "ARG": "Argentina", "ARM": "Armenia", "ARU": "Aruba", "ASA": "American Samoa", "ATG": "Antigua and Barbuda",
    "AUS": "Australia", "AUT": "Austria", "AZE": "Azerbaijan", "BAH": "Bahamas", "BAN": "Bangladesh", "BDI": "Burundi",
    "BEL": "Belgium", "BEN": "Benin", "BER": "Bermuda", "BFA": "Burkina Faso", "BHR": "Bahrain", "BHU": "Bhutan",
    "BIH": "Bosnia and Herzegovina", "BLR": "Belarus", "BLZ": "Belize", "BOL": "Bolivia", "BOT": "Botswana",
    "BRA": "Brazil", "BRB": "Barbados", "BRU": "Brunei", "BUL": "Bulgaria", "CAM": "Cambodia", "CAN": "Canada",
    "CAY": "Cayman Islands", "CGO": "Congo", "CHA": "Chad", "CHI": "Chile", "CHN": "China", "CIV": "Ivory Coast",
    "CMR": "Cameroon", "COD": "DR Congo", "COK": "Cook Islands", "COL": "Colombia", "COM": "Comoros",
    "CPV": "Cape Verde", "CRC": "Costa Rica", "CRO": "Croatia", "CTA": "Central African Republic", "CUB": "Cuba",
    "CUW": "Curaçao", "CYP": "Cyprus", "CZE": "Czech Republic", "DEN": "Denmark", "DJI": "Djibouti", "DMA": "Dominica",
    "DOM": "Dominican Republic", "ECU": "Ecuador", "EGY": "Egypt", "ENG": "England", "EQG": "Equatorial Guinea",
    "ERI": "Eritrea", "ESP": "Spain", "EST": "Estonia", "ETH": "Ethiopia", "FIJ": "Fiji", "FIN": "Finland",
    "FRA": "France", "FRO": "Faroe Islands", "GAB": "Gabon", "GAM": "Gambia", "GEO": "Georgia", "GER": "Germany",
    "GHA": "Ghana", "GIB": "Gibraltar", "GNB": "Guinea-Bissau", "GRE": "Greece", "GRN": "Grenada", "GUA": "Guatemala",
    "GUI": "Guinea", "GUM": "Guam", "GUY": "Guyana", "HAI": "Haiti", "HKG": "Hong Kong", "HON": "Honduras",
    "HUN": "Hungary", "IDN": "Indonesia", "IND": "India", "IRL": "Republic of Ireland", "IRN": "Iran", "IRQ": "Iraq",
    "ISL": "Iceland", "ISR": "Israel", "ITA": "Italy", "JAM": "Jamaica", "JOR": "Jordan", "JPN": "Japan",
    "KAZ": "Kazakhstan", "KEN": "Kenya", "KGZ": "Kyrgyzstan", "KOR": "South Korea", "KOS": "Kosovo", "KSA": "Saudi Arabia",
    "KUW": "Kuwait", "LAO": "Laos", "LBN": "Lebanon", "LBR": "Liberia", "LBY": "Libya", "LCA": "Saint Lucia",
    "LES": "Lesotho", "LIE": "Liechtenstein", "LTU": "Lithuania", "LUX": "Luxembourg", "LVA": "Latvia", "MAC": "Macau",
    "MAD": "Madagascar", "MAR": "Morocco", "MAS": "Malaysia", "MDA": "Moldova", "MDV": "Maldives", "MEX": "Mexico",
    "MKD": "North Macedonia", "MLI": "Mali", "MLT": "Malta", "MNE": "Montenegro", "MNG": "Mongolia",
    "MOZ": "Mozambique", "MRI": "Mauritius", "MSR": "Montserrat", "MTN": "Mauritania", "MWI": "Malawi",
    "MYA": "Myanmar", "NAM": "Namibia", "NCA": "Nicaragua", "NCL": "New Caledonia", "NED": "Netherlands", "NEP": "Nepal",
    "NGA": "Nigeria", "NIG": "Niger", "NIR": "Northern Ireland", "NOR": "Norway", "NZL": "New Zealand", "OMA": "Oman",
    "PAK": "Pakistan", "PAN": "Panama", "PAR": "Paraguay", "PER": "Peru", "PHI": "Philippines", "PLE": "Palestine",
    "PNG": "Papua New Guinea", "POL": "Poland", "POR": "Portugal", "PRK": "North Korea", "PUR": "Puerto Rico",
    "QAT": "Qatar", "ROU": "Romania", "RSA": "South Africa", "RUS": "Russia", "RWA": "Rwanda", "SAM": "Samoa",
    "SCO": "Scotland", "SDN": "Sudan", "SEN": "Senegal", "SEY": "Seychelles", "SGP": "Singapore", "SKN": "Saint Kitts and Nevis",
    "SLE": "Sierra Leone", "SLV": "El Salvador", "SMR": "San Marino", "SOL": "Solomon Islands", "SOM": "Somalia",
    "SRB": "Serbia", "SRI": "Sri Lanka", "SSD": "South Sudan", "STP": "São Tomé and Príncipe", "SUI": "Switzerland",
    "SUR": "Suriname", "SVK": "Slovakia", "SVN": "Slovenia", "SWE": "Sweden", "SWZ": "Eswatini", "SYR": "Syria",
    "TAH": "Tahiti", "TAN": "Tanzania", "TCA": "Turks and Caicos Islands", "TGA": "Tonga", "THA": "Thailand",
    "TJK": "Tajikistan", "TKM": "Turkmenistan", "TLS": "Timor-Leste", "TOG": "Togo", "TPE": "Chinese Taipei",
    "TRI": "Trinidad and Tobago", "TUN": "Tunisia", "TUR": "Turkey", "UAE": "United Arab Emirates", "UGA": "Uganda",
    "UKR": "Ukraine", "URU": "Uruguay", "USA": "United States", "UZB": "Uzbekistan", "VAN": "Vanuatu", "VEN": "Venezuela",
    "VGB": "British Virgin Islands", "VIE": "Vietnam", "VIN": "Saint Vincent and the Grenadines", "VIR": "US Virgin Islands",
    "WAL": "Wales", "YEM": "Yemen", "ZAM": "Zambia", "ZIM": "Zimbabwe",
}

# Country names used by public.countries that differ from the FIFA list above.
SITE_COUNTRY = {"Czech Republic": "Czechia"}

# Words that carry no identity in a club name.
NOISE = {
    "fc", "f", "c", "cf", "afc", "sc", "ac", "as", "ss", "ssc", "us", "sv", "fk", "nk", "sk", "if", "bk", "ik", "ff", "cd",
    "ud", "sd", "rcd", "rc", "ca", "club", "football", "futbol", "fussball", "calcio", "de", "del", "la", "le", "les", "the",
    "and", "1", "04", "05", "07", "09", "1899", "1900", "1901", "1903", "1907", "1909", "1913", "1846", "1848", "1860",
    "vfb", "vfl", "tsg", "spvgg", "kv", "krc", "rsc", "rfc", "osc", "ogc", "hsc", "aj", "sl", "gd",
    "sad", "jk", "fotbal", "ks", "kks", "gks", "mks", "s", "a", "e", "d", "de", "do", "da", "cfc", "ifk", "aik", "bv",
}
WORD_MAP = {"utd": "united", "man": "manchester", "st": "saint", "sint": "saint", "sankt": "saint", "wolverhampton": "wolves", "olympique": "",
            "internazionale": "inter", "munchen": "munich", "koln": "cologne", "nurnberg": "nuremberg"}


def norm(name: str | None) -> str:
    """Lower-case, accents and punctuation stripped, noise words dropped."""
    if not name:
        return ""
    s = re.sub(r"\(.*?\)", " ", name)                       # "Lewis Hall (footballer)" style qualifiers
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s.replace("&", " and "))
    words = [WORD_MAP.get(w, w) for w in s.split()]
    words = [w for w in words if w and w not in NOISE]
    return " ".join(words)


def variants(*names: str | None) -> set[str]:
    out = set()
    for n in names:
        v = norm(n)
        if v:
            out.add(v)
            out.add(v.replace(" ", ""))
    return out


class Index:
    """Clubs of one source, findable by (country, normalised name)."""

    def __init__(self):
        self.by_key: dict[tuple[str, str], object] = {}
        self.by_name: dict[str, list] = {}
        self.by_country: dict[str, list] = {}
        self._cache: dict = {}

    def add(self, country: str | None, item, *names: str | None) -> None:
        c = (country or "").lower()
        for v in variants(*names):
            if (c, v) not in self.by_key:
                self.by_key[(c, v)] = item
                if " " in v or len(v) >= 4:
                    self.by_country.setdefault(c, []).append((frozenset(v.split()), item))
            self.by_name.setdefault(v, []).append(item)

    def find(self, country: str | None, *names: str | None):
        key = (country, names)
        if key not in self._cache:
            self._cache[key] = self._find(country, *names)
        return self._cache[key]

    def _find(self, country: str | None, *names: str | None):
        c = (country or "").lower()
        vs = variants(*names)
        for v in vs:
            hit = self.by_key.get((c, v))
            if hit is not None:
                return hit
        # One name's words inside the other's, uniquely within the country ("Red Bull Salzburg" ~ "Salzburg").
        if c:
            cands = []
            for kw, item in self.by_country.get(c, []):
                for v in vs:
                    w = set(v.split())
                    if (kw <= w or w <= kw) and min(len(kw), len(w)) >= 1 and len(" ".join(sorted(kw & w))) >= 5:
                        cands.append(item)
            if len({id(x) for x in cands}) == 1:
                return cands[0]
        # Unique name anywhere (a club playing in another country's league, e.g. Welsh clubs in England).
        for v in vs:
            hits = self.by_name.get(v, [])
            if len({id(h) for h in hits}) == 1 and len(v) >= 5:
                return hits[0]
        return None

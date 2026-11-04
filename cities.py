"""City catalog + normalize messy free-text to catalog values."""

from __future__ import annotations

import re

# Curated places people on WIRING actually use. Country → cities.
PLACES: list[dict[str, object]] = [
    {
        "country": "Россия",
        "cities": [
            "Москва",
            "Санкт-Петербург",
            "Новосибирск",
            "Екатеринбург",
            "Казань",
            "Нижний Новгород",
            "Челябинск",
            "Самара",
            "Омск",
            "Ростов-на-Дону",
            "Уфа",
            "Красноярск",
            "Воронеж",
            "Пермь",
            "Волгоград",
            "Краснодар",
            "Саратов",
            "Тюмень",
            "Тольятти",
            "Ижевск",
            "Барнаул",
            "Иркутск",
            "Ульяновск",
            "Хабаровск",
            "Ярославль",
            "Владивосток",
            "Махачкала",
            "Томск",
            "Оренбург",
            "Кемерово",
            "Новокузнецк",
            "Рязань",
            "Набережные Челны",
            "Астрахань",
            "Пенза",
            "Липецк",
            "Киров",
            "Чебоксары",
            "Калининград",
            "Тула",
            "Курск",
            "Сочи",
            "Ставрополь",
            "Тверь",
            "Иваново",
            "Брянск",
            "Белгород",
            "Архангельск",
            "Владимир",
            "Севастополь",
            "Симферополь",
            "Псков",
            "Великий Новгород",
            "Смоленск",
            "Вологда",
            "Мурманск",
            "Петрозаводск",
            "Сыктывкар",
            "Йошкар-Ола",
            "Саранск",
            "Кострома",
            "Калуга",
            "Орёл",
            "Тамбов",
            "Курган",
            "Чита",
            "Якутск",
            "Грозный",
            "Нальчик",
            "Владикавказ",
            "Майкоп",
            "Элиста",
            "Абакан",
            "Горно-Алтайск",
            "Биробиджан",
            "Анадырь",
            "Магадан",
            "Южно-Сахалинск",
            "Петропавловск-Камчатский",
            "Химки",
            "Балашиха",
            "Подольск",
            "Мытищи",
            "Королёв",
            "Люберцы",
            "Красногорск",
            "Одинцово",
            "Домодедово",
            "Щёлково",
            "Пушкино",
            "Раменское",
            "Жуковский",
            "Серпухов",
            "Коломна",
            "Электросталь",
            "Ногинск",
            "Реутов",
            "Долгопрудный",
            "Лобня",
            "Зеленоград",
        ],
    },
    {
        "country": "Беларусь",
        "cities": ["Минск", "Гомель", "Брест", "Гродно", "Витебск", "Могилёв", "Бобруйск", "Барановичи", "Борисов", "Пинск"],
    },
    {
        "country": "Украина",
        "cities": [
            "Киев",
            "Харьков",
            "Одесса",
            "Днепр",
            "Львов",
            "Запорожье",
            "Винница",
            "Чернигов",
            "Полтава",
            "Черновцы",
            "Ивано-Франковск",
            "Тернополь",
            "Ужгород",
            "Хмельницкий",
            "Сумы",
            "Николаев",
            "Херсон",
            "Мариуполь",
            "Кривой Рог",
            "Житомир",
            "Ровно",
            "Луцк",
            "Черкассы",
            "Кропивницкий",
        ],
    },
    {
        "country": "Казахстан",
        "cities": ["Алматы", "Астана", "Шымкент", "Караганда", "Актобе", "Павлодар", "Усть-Каменогорск", "Семей", "Атырау", "Актау"],
    },
    {
        "country": "Грузия",
        "cities": ["Тбилиси", "Батуми", "Кутаиси", "Рустави"],
    },
    {
        "country": "Армения",
        "cities": ["Ереван", "Гюмри", "Ванадзор"],
    },
    {
        "country": "Азербайджан",
        "cities": ["Баку", "Гянджа", "Сумгаит"],
    },
    {
        "country": "Молдова",
        "cities": ["Кишинёв", "Тирасполь", "Бельцы"],
    },
    {
        "country": "Узбекистан",
        "cities": ["Ташкент", "Самарканд", "Бухара", "Наманган"],
    },
    {
        "country": "Кыргызстан",
        "cities": ["Бишкек", "Ош"],
    },
    {
        "country": "Таджикистан",
        "cities": ["Душанбе", "Худжанд"],
    },
    {
        "country": "Латвия",
        "cities": ["Рига", "Даугавпилс", "Лиепая", "Юрмала"],
    },
    {
        "country": "Литва",
        "cities": ["Вильнюс", "Каунас", "Клайпеда"],
    },
    {
        "country": "Эстония",
        "cities": ["Таллин", "Тарту", "Нарва"],
    },
    {
        "country": "Польша",
        "cities": ["Варшава", "Краков", "Вроцлав", "Гданьск", "Познань", "Лодзь", "Катовице", "Люблин", "Щецин"],
    },
    {
        "country": "Чехия",
        "cities": ["Прага", "Брно", "Острава"],
    },
    {
        "country": "Словакия",
        "cities": ["Братислава", "Кошице"],
    },
    {
        "country": "Венгрия",
        "cities": ["Будапешт", "Дебрецен"],
    },
    {
        "country": "Германия",
        "cities": ["Берлин", "Мюнхен", "Гамбург", "Кёльн", "Франкфурт", "Дюссельдорф", "Штутгарт", "Лейпциг", "Дрезден"],
    },
    {
        "country": "Австрия",
        "cities": ["Вена", "Грац", "Зальцбург"],
    },
    {
        "country": "Швейцария",
        "cities": ["Цюрих", "Женева", "Берн", "Базель"],
    },
    {
        "country": "Нидерланды",
        "cities": ["Амстердам", "Роттердам", "Гаага", "Утрехт"],
    },
    {
        "country": "Бельгия",
        "cities": ["Брюссель", "Антверпен", "Гент"],
    },
    {
        "country": "Франция",
        "cities": ["Париж", "Лион", "Марсель", "Тулуза", "Ницца"],
    },
    {
        "country": "Испания",
        "cities": ["Мадрид", "Барселона", "Валенсия", "Севилья", "Малага"],
    },
    {
        "country": "Италия",
        "cities": ["Рим", "Милан", "Турин", "Флоренция", "Неаполь", "Болонья"],
    },
    {
        "country": "Португалия",
        "cities": ["Лиссабон", "Порту"],
    },
    {
        "country": "Великобритания",
        "cities": ["Лондон", "Манчестер", "Эдинбург", "Бирмингем", "Глазго"],
    },
    {
        "country": "Ирландия",
        "cities": ["Дублин", "Корк"],
    },
    {
        "country": "Швеция",
        "cities": ["Стокгольм", "Гётеборг", "Мальмё"],
    },
    {
        "country": "Норвегия",
        "cities": ["Осло", "Берген"],
    },
    {
        "country": "Финляндия",
        "cities": ["Хельсинки", "Тампере", "Турку"],
    },
    {
        "country": "Дания",
        "cities": ["Копенгаген", "Орхус"],
    },
    {
        "country": "Турция",
        "cities": ["Стамбул", "Анкара", "Измир", "Анталья"],
    },
    {
        "country": "Кипр",
        "cities": ["Никосия", "Лимасол", "Ларнака", "Пафос"],
    },
    {
        "country": "Греция",
        "cities": ["Афины", "Салоники"],
    },
    {
        "country": "Сербия",
        "cities": ["Белград", "Нови-Сад", "Ниш"],
    },
    {
        "country": "Черногория",
        "cities": ["Подгорица", "Будва", "Тиват", "Херцег-Нови", "Котор", "Бар"],
    },
    {
        "country": "Хорватия",
        "cities": ["Загреб", "Сплит", "Дубровник"],
    },
    {
        "country": "Болгария",
        "cities": ["София", "Пловдив", "Варна", "Бургас"],
    },
    {
        "country": "Румыния",
        "cities": ["Бухарест", "Клуж-Напока", "Тимишоара"],
    },
    {
        "country": "Израиль",
        "cities": ["Тель-Авив", "Иерусалим", "Хайфа"],
    },
    {
        "country": "ОАЭ",
        "cities": ["Дубай", "Абу-Даби"],
    },
    {
        "country": "Вьетнам",
        "cities": ["Ханой", "Хошимин", "Дананг", "Хайфон", "Нячанг", "Хюэ", "Кантхо", "Далат"],
    },
    {
        "country": "США",
        "cities": ["Нью-Йорк", "Лос-Анджелес", "Чикаго", "Сан-Франциско", "Сиэтл", "Бостон", "Майами"],
    },
    {
        "country": "Канада",
        "cities": ["Торонто", "Ванкувер", "Монреаль", "Оттава"],
    },
    {
        "country": "другое",
        "cities": ["онлайн / не важно", "в разъездах"],
    },
]

_ALIASES = {
    "pscov": "Псков",
    "pskov": "Псков",
    "псков": "Псков",
    "gomel": "Гомель",
    "гомель": "Гомель",
    "budva": "Будва",
    "будва": "Будва",
    "belgrade": "Белград",
    "beograd": "Белград",
    "белград": "Белград",
    "moscow": "Москва",
    "moskva": "Москва",
    "москва": "Москва",
    "msk": "Москва",
    "мск": "Москва",
    "kiev": "Киев",
    "kyiv": "Киев",
    "киев": "Киев",
    "київ": "Киев",
    "krakow": "Краков",
    "cracow": "Краков",
    "kraków": "Краков",
    "краков": "Краков",
    "tbilisi": "Тбилиси",
    "тбилиси": "Тбилиси",
    "yerevan": "Ереван",
    "erevan": "Ереван",
    "ереван": "Ереван",
    "istanbul": "Стамбул",
    "стамбул": "Стамбул",
    "berlin": "Берлин",
    "берлин": "Берлин",
    "dublin": "Дублин",
    "дublin": "Дублин",
    "дублин": "Дублин",
    "даблин": "Дублин",
    "cork": "Корк",
    "корк": "Корк",
    "london": "Лондон",
    "лондон": "Лондон",
    "manchester": "Манчестер",
    "манчестер": "Манчестер",
    "edinburgh": "Эдинбург",
    "эдинбург": "Эдинбург",
    "birmingham": "Бирмингем",
    "бирмингем": "Бирмингем",
    "glasgow": "Глазго",
    "глазго": "Глазго",
    "warsaw": "Варшава",
    "warszawa": "Варшава",
    "варшава": "Варшава",
    "vilnius": "Вильнюс",
    "вильнюс": "Вильнюс",
    "novi sad": "Нови-Сад",
    "novi-sad": "Нови-Сад",
    "novisad": "Нови-Сад",
    "нови сад": "Нови-Сад",
    "нови-сад": "Нови-Сад",
    "saratov": "Саратов",
    "саратов": "Саратов",
    "riga": "Рига",
    "рига": "Рига",
    "minsk": "Минск",
    "минск": "Минск",
    "spb": "Санкт-Петербург",
    "питер": "Санкт-Петербург",
    "спб": "Санкт-Петербург",
    "petersburg": "Санкт-Петербург",
    "saint petersburg": "Санкт-Петербург",
    "st petersburg": "Санкт-Петербург",
    "санкт-петербург": "Санкт-Петербург",
    "санкт петербург": "Санкт-Петербург",
    "nn": "Нижний Новгород",
    "нижний": "Нижний Новгород",
    "nizhny": "Нижний Новгород",
    "nizhniy novgorod": "Нижний Новгород",
    "ekb": "Екатеринбург",
    "екатеринбург": "Екатеринбург",
    "yekaterinburg": "Екатеринбург",
    "ekaterinburg": "Екатеринбург",
    "rostov": "Ростов-на-Дону",
    "rostov on don": "Ростов-на-Дону",
    "ростов": "Ростов-на-Дону",
    "ростов-на-дону": "Ростов-на-Дону",
    "ростов на дону": "Ростов-на-Дону",
    "dnipro": "Днепр",
    "днепр": "Днепр",
    "днепропетровск": "Днепр",
    "almaty": "Алматы",
    "алматы": "Алматы",
    "алма ата": "Алматы",
    "алма-ата": "Алматы",
    "nur sultan": "Астана",
    "нур султан": "Астана",
    "астана": "Астана",
    "astana": "Астана",
    "kishinev": "Кишинёв",
    "chisinau": "Кишинёв",
    "кишинев": "Кишинёв",
    "кишинёв": "Кишинёв",
    "tallinn": "Таллин",
    "таллин": "Таллин",
    "таллинн": "Таллин",
    "prague": "Прага",
    "praha": "Прага",
    "прага": "Прага",
    "hanoi": "Ханой",
    "ханой": "Ханой",
    "ho chi minh": "Хошимин",
    "ho chi minh city": "Хошимин",
    "saigon": "Хошимин",
    "sai gon": "Хошимин",
    "сайгон": "Хошимин",
    "хошимин": "Хошимин",
    "da nang": "Дананг",
    "danang": "Дананг",
    "дананг": "Дананг",
    "nha trang": "Нячанг",
    "nhatrang": "Нячанг",
    "нячанг": "Нячанг",
    "hai phong": "Хайфон",
    "haiphong": "Хайфон",
    "хайфон": "Хайфон",
    "hue": "Хюэ",
    "хюэ": "Хюэ",
    "хюе": "Хюэ",
    "can tho": "Кантхо",
    "cantho": "Кантхо",
    "кантхо": "Кантхо",
    "da lat": "Далат",
    "dalat": "Далат",
    "далат": "Далат",
    "online": "онлайн / не важно",
    "онлайн": "онлайн / не важно",
    "remote": "онлайн / не важно",
}


def _key(value: str) -> str:
    text = value.strip().lower().replace("ё", "е")
    text = text.replace("'", "").replace("`", "").replace("ʼ", "").replace("’", "")
    text = re.sub(r"[-–—_]+", " ", text)
    return " ".join(text.split())


def _build_city_set() -> set[str]:
    out: set[str] = set()
    for block in PLACES:
        for city in block["cities"]:  # type: ignore[index]
            out.add(str(city))
    return out


# The curated values remain stable for existing profiles; add every world country.
from world_places import countries as world_countries
_existing_countries = {str(block["country"]) for block in PLACES}
for _country in world_countries().values():
    if _country["name"] not in _existing_countries:
        PLACES.append({"country": _country["name"], "cities": []})

CITIES: list[str] = []
for _block in PLACES:
    CITIES.extend(str(c) for c in _block["cities"])  # type: ignore[index]
CITY_SET: set[str] = _build_city_set()
_CITY_COUNTRY = {str(city): str(block['country']) for block in PLACES for city in block['cities']}


def _legacy_city(value: str) -> str | None:
    key = _key(value)
    compact = key.replace(' ', '')
    if key in _ALIASES:
        return _ALIASES[key]
    if compact in _ALIASES:
        return _ALIASES[compact]
    return next((city for city in CITY_SET if _key(city) == key or _key(city).replace(' ', '') == compact), None)


def _preserve_legacy(value: str) -> str:
    parts = value.split(' · ')
    legacy = _legacy_city(parts[0])
    return legacy if legacy and len(parts) > 1 and _CITY_COUNTRY.get(legacy) == parts[-1] else value


def normalize_city(raw: str) -> str:
    """Map free text / aliases to a catalog city when possible; else title-case leftover."""
    value = (raw or "").strip()
    if not value:
        return value
    if value in CITY_SET:
        return value
    legacy = _legacy_city(value)
    if legacy:
        return legacy
    from world_places import resolve
    resolved = resolve(value)
    if resolved:
        return _preserve_legacy(resolved)
    cleaned = [part[:1].upper() + part[1:] if part else part for part in value.split()]
    return " ".join(cleaned)


def catalog_city(raw: str) -> str | None:
    """Return catalog city name or None if input cannot be resolved into the directory."""
    value = (raw or "").strip()
    if not value:
        return None
    if value in CITY_SET:
        return value
    resolved = normalize_city(value)
    if resolved in CITY_SET:
        return resolved
    from world_places import resolve
    return resolve(resolved)


def is_catalog_city(raw: str) -> bool:
    return catalog_city(raw) is not None


# Names people type that are not the catalog label or the English CLDR name.
_COUNTRY_ALIASES: dict[str, tuple[str, ...]] = {
    "США": ("америка", "штаты", "соединенные штаты", "соединённые штаты", "usa", "us", "america", "united states"),
    "Великобритания": ("англия", "британия", "england", "britain", "uk", "great britain", "united kingdom"),
    "Нидерланды": ("голландия", "holland"),
    "ОАЭ": ("эмираты", "uae", "emirates"),
    "Южная Корея": ("корея", "korea", "south korea"),
    "КНДР": ("северная корея", "north korea"),
    "Чехия": ("czech", "czechia"),
    "Мьянма (Бирма)": ("бирма", "burma", "мьянма"),
}


def country_search_index() -> dict[str, list[str]]:
    """Search tokens per country: catalog name, English name, and common aliases."""
    from world_places import countries, key as fold
    english = {item["name"]: str(item.get("en") or "") for item in countries().values()}
    out: dict[str, list[str]] = {}
    for block in PLACES:
        name = str(block["country"])
        tokens = {fold(name)}
        if english.get(name):
            tokens.add(fold(english[name]))
        for alias in _COUNTRY_ALIASES.get(name, ()):
            tokens.add(fold(alias))
        tokens.discard("")
        out[name] = sorted(tokens)
    return out


def city_search_index() -> dict[str, list[str]]:
    """Search tokens per catalog city (labels, aliases, compact forms) for UI filters."""
    grouped: dict[str, set[str]] = {
        city: {_key(city), _key(city).replace(" ", "")} for city in CITY_SET
    }
    for alias, city in _ALIASES.items():
        bucket = grouped.get(city)
        if not bucket:
            continue
        bucket.add(alias)
        bucket.add(alias.replace(" ", ""))
    return {city: sorted(keys) for city, keys in grouped.items()}


def places_payload() -> list[dict[str, object]]:
    rows = [
        {
            "country": b["country"],
            "cities": sorted((b["cities"] or []), key=lambda c: str(c).casefold()),  # type: ignore[index]
        }
        for b in PLACES
    ]
    rest = [row for row in rows if row["country"] != "другое"]
    other = [row for row in rows if row["country"] == "другое"]
    rest.sort(key=lambda row: str(row["country"]).casefold())
    return rest + other


def country_of_city(raw: str) -> str:
    from world_places import qualified_country
    country = qualified_country(raw)
    if country:
        return country
    city = catalog_city(raw) or str(raw or "").strip()
    if not city:
        return ""
    country = qualified_country(city)
    if country:
        return country
    for block in PLACES:
        if city in (block.get("cities") or []):
            return str(block.get("country") or "")
    return ""

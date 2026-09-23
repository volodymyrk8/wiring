"""Neurotype, vibe, prompts and intent catalogs for WIRING."""

from __future__ import annotations

NEURO: list[dict[str, str]] = [
    {"id": "asd", "label": "РАС (ASD)", "hint": "аутичный спектр. темнота, тишина и специнтересы"},
    {"id": "adhd", "label": "СДВГ (ADHD)", "hint": "сто мыслей в минуту 24/7"},
    {"id": "audhd", "label": "АуСДВГ (AuDHD)", "hint": "к-к-комбо! РАС и СДВГ в одном флаконе"},
    {"id": "bpd", "label": "ПРЛ (BPD)", "hint": "интенсивность, крайности и фонтан эмоций"},
    {"id": "ocd", "label": "ОКР (OCD)", "hint": "мозг требует навязчивых ритуалов"},
    {"id": "bipolar", "label": "БАР-спектр", "hint": "эра прайма, эра депрессии, и так по кругу"},
    {"id": "cptsd", "label": "КПТСР (CPTSD)", "hint": "всегда настороже из-за длительной травмы"},
    {"id": "ptsd", "label": "ПТСР (PTSD)", "hint": "вьетнамские флешбэки о пережитых травмах"},
    {"id": "anxiety", "label": "ГТР / тревожное", "hint": "сто сценариев катастрофы в голове"},
    {"id": "social_phobia", "label": "социофобия", "hint": "люди — страшно, вырубай"},
    {"id": "depression", "label": "депрессия", "hint": "мир в серых тонах"},
    {"id": "dyslexia", "label": "дислексия / дисграфия", "hint": "собрать буквы — целый квест"},
    {"id": "dyspraxia", "label": "диспраксия", "hint": "тело иногда лагает"},
    {"id": "tourette", "label": "синдром Туретта", "hint": "непроизвольные тики"},
]

# Still valid on old profiles; hidden from new pickers via catalog order only.
LEGACY_NEURO_IDS = frozenset({"pda", "rsd", "hsp", "2e"})

VIBE: list[dict[str, str]] = [
    {"id": "selfdx", "label": "самодиагностика", "hint": "самостоятельно разбираюсь со своей психикой"},
    {"id": "prodx", "label": "диагноз от психиатра", "hint": "диагноз подтвержден врачом"},
    {"id": "latedx", "label": "поздняя диагностика", "hint": "путь к диагнозу был долгим"},
    {"id": "neurotraits", "label": "нейроотличные черты", "hint": "особенности выражены не ярко"},
    {"id": "intherapy", "label": "в терапии", "hint": "хожу к психологу/психотерапевту"},
    {"id": "burnout", "label": "выгорание", "hint": "усталость от жизни среди нейротипиков"},
    {"id": "empath", "label": "высокая эмпатия", "hint": "тонкая настройка на чувства и эмоции"},
    {"id": "infodump", "label": "люблю инфодампы", "hint": "расскажем друг другу о специнтересах и гиперфиксах"},
    {"id": "bodydouble", "label": "боди-даблинг партнёр", "hint": "ищу, с кем вместе делать дела"},
    {"id": "anxious-att", "label": "тревожная привязанность", "hint": "переживаю за отношения больше, чем за себя"},
    {"id": "avoidant-att", "label": "избегающая привязанность", "hint": "сближение — угроза, дистанция — безопасность"},
    {"id": "disorg-att", "label": "дезорганизованная привязанность", "hint": "тяжело и сближение, и дистанция"},
    {"id": "secure-att", "label": "надежная привязанность", "hint": "стабильность в отношениях"},
    {"id": "online-only", "label": "только онлайн", "hint": "хочу общаться только в интернете"},
    {"id": "offline-ok", "label": "возможен оффлайн", "hint": "не против встретиться лично"},
    {"id": "nonsmalltalk", "label": "без смолл-тока", "hint": "никаких «как дела, как погода»"},
    {"id": "no-voice", "label": "без голосовых", "hint": "только текстом"},
    {"id": "voice-ok", "label": "с голосовыми", "hint": "люблю говорить и слушать"},
]

LEGACY_VIBE_IDS = frozenset(
    {
        "neurospicy",
        "masking",
        "routines",
        "parallel",
        "overstim",
        "spoons",
        "ace",
        "enby",
        "terminally-online",
        "softlaunch",
        "healing",
        "trauma-informed",
        "hyperfix",
        "voicenotes",
        "just-a-little",
    }
)

LOOKING_FOR = [
    {"id": "women", "label": "женщин"},
    {"id": "men", "label": "мужчин"},
    {"id": "everyone", "label": "всех"},
    {"id": "friends", "label": "скорее друзей"},
]

GENDERS = [
    {"id": "woman", "label": "женщина"},
    {"id": "man", "label": "мужчина"},
    {"id": "nb", "label": "небинарно"},
    {"id": "hidden", "label": "скрыто"},
]

LEGACY_GENDER_IDS = frozenset({"other"})

INTENTS = [
    {"id": "relationship", "label": "отношения"},
    {"id": "dating", "label": "свидания, посмотрим"},
    {"id": "friends", "label": "дружба / компания"},
    {"id": "chat", "label": "пока просто писать"},
]

PROMPTS = [
    {"id": "special", "label": "мой special interest сейчас"},
    {"id": "sensory", "label": "сенсорно мне ок / не ок"},
    {"id": "date", "label": "идеальное свидание"},
    {"id": "never", "label": "никогда не пиши мне"},
    {"id": "spoons", "label": "про ложки и батарею"},
    {"id": "parallel", "label": "parallel play для меня это"},
    {"id": "text", "label": "как со мной лучше писать"},
    {"id": "green", "label": "зелёный флаг"},
    {"id": "mask", "label": "маска падает когда"},
    {"id": "obsessed", "label": "сейчас гиперакцент на"},
    {"id": "sunday", "label": "воскресенье в идеале"},
    {"id": "deal", "label": "стоп-сигнал"},
]

REPORT_REASONS = [
    {"id": "spam", "label": "спам / реклама"},
    {"id": "fake", "label": "фейк или чужие фото"},
    {"id": "harassment", "label": "домогательство / угрозы"},
    {"id": "underage", "label": "похоже, нет 18"},
    {"id": "other", "label": "другое"},
]

DEFAULT_ALBUMS = ["я", "жизнь", "special interest", "звери"]

NEURO_IDS = {item["id"] for item in NEURO} | LEGACY_NEURO_IDS
# Legacy vibe ids remain in DB until cleanup; new saves accept only the current catalog.
VIBE_IDS = {item["id"] for item in VIBE}
LOOKING_IDS = {item["id"] for item in LOOKING_FOR}
GENDER_IDS = {item["id"] for item in GENDERS} | LEGACY_GENDER_IDS
INTENT_IDS = {item["id"] for item in INTENTS}
PROMPT_IDS = {item["id"] for item in PROMPTS}
REPORT_IDS = {item["id"] for item in REPORT_REASONS}

PORTRAITS = [f"portraits/p0{i}.jpg" for i in range(1, 10)]
PEOPLE = [f"people/{i:02d}.jpg" for i in range(1, 13)]
SEED_PHOTOS = set(PORTRAITS) | set(PEOPLE)


def catalog_payload() -> dict:
    from cities import places_payload
    from glossary import enrich

    return {
        "neuro": enrich(NEURO),
        "vibe": enrich(VIBE),
        "looking_for": LOOKING_FOR,
        "genders": GENDERS,
        "intents": INTENTS,
        "places": places_payload(),
        "prompts": PROMPTS,
        "report_reasons": REPORT_REASONS,
        "default_albums": DEFAULT_ALBUMS,
        "limits": {
            "photos": 12,
            "albums": 8,
            "prompts": 3,
            "bio": 1200,
        },
    }

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
    {"id": "neurospicy", "label": "neurospicy", "hint": "слово 2024+, смысл размыт"},
    {"id": "selfdx", "label": "self-dx friendly", "hint": "диагноз из треда тоже считается"},
    {"id": "prodx", "label": "есть официальный диагноз", "hint": "бумага от врача"},
    {"id": "latedx", "label": "late-diagnosed", "hint": "узнал(а) о себе после 20"},
    {"id": "masking", "label": "masking exhaustion", "hint": "после людей нужен темноты день"},
    {"id": "infodump", "label": "info-dump welcome", "hint": "специальный интерес = сексуально"},
    {"id": "routines", "label": "routines or death", "hint": "сломали план — сломали человека"},
    {"id": "parallel", "label": "parallel play date", "hint": "молчать в одной комнате — интим"},
    {"id": "bodydouble", "label": "body doubling buddy", "hint": "рядом молча, каждый за своим"},
    {"id": "nonsmalltalk", "label": "no small talk", "hint": "сразу про смерть и нейромедиаторы"},
    {"id": "overstim", "label": "overstimulation warning", "hint": "бары и open space — нет"},
    {"id": "spoons", "label": "spoon theory", "hint": "сегодня три ложки, не трать"},
    {"id": "anxious-att", "label": "тревожная привязанность", "hint": "тишина в чате = тревога, нужна ясность"},
    {"id": "avoidant-att", "label": "избегающая привязанность", "hint": "сближение = побег"},
    {"id": "disorg-att", "label": "дезорганизованная", "hint": "подойди / отойди / подойди"},
    {"id": "ace", "label": "ace / demi / aro", "hint": "секс не обязательный DLC"},
    {"id": "enby", "label": "non-binary / they", "hint": "пол — настройка, не судьба"},
    {"id": "empath", "label": "эмпат", "hint": "чувствую комнату раньше людей"},
    {"id": "terminally-online", "label": "terminally online", "hint": "референсы быстрее, чем речь"},
    {"id": "softlaunch", "label": "soft launch only", "hint": "никаких парных сторис"},
    {"id": "healing", "label": "healing era", "hint": "терапия как хобби"},
    {"id": "trauma-informed", "label": "trauma-informed", "hint": "триггеры проговариваем заранее"},
    {"id": "hyperfix", "label": "hyperfixation buddy", "hint": "три недели одна тема, потом новая"},
    {"id": "voicenotes", "label": "только голосовые", "hint": "текст — это работа"},
    {"id": "just-a-little", "label": "just a little autistic", "hint": "современная классика"},
]

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
    {"id": "other", "label": "по-другому"},
]

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
VIBE_IDS = {item["id"] for item in VIBE}
LOOKING_IDS = {item["id"] for item in LOOKING_FOR}
GENDER_IDS = {item["id"] for item in GENDERS}
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

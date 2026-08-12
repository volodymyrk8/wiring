"""Neurotype and vibe catalogs for WIRING."""

from __future__ import annotations

NEURO: list[dict[str, str]] = [
    {"id": "asd", "label": "ASD / аутизм", "hint": "сенсорика, скрипты, честность"},
    {"id": "adhd", "label": "ADHD / СДВГ", "hint": "гиперфокус, дедлайны как миф"},
    {"id": "audhd", "label": "AuDHD", "hint": "два ядра, один процессор"},
    {"id": "bpd", "label": "BPD / ПРЛ", "hint": "интенсивность как климат"},
    {"id": "ocd", "label": "OCD / ОКР", "hint": "ритуалы, проверка, контроль"},
    {"id": "bipolar", "label": "биполярное / БАР", "hint": "амплитуда, не настроение"},
    {"id": "cptsd", "label": "CPTSD / КПТСР", "hint": "тело помнит раньше головы"},
    {"id": "anxiety", "label": "тревожное", "hint": "мозг пишет fanfic про катастрофы"},
    {"id": "depression", "label": "депрессия", "hint": "батарея на 12%"},
    {"id": "dyslexia", "label": "дислексия", "hint": "мысли быстрее текста"},
    {"id": "dyspraxia", "label": "диспраксия", "hint": "тело иногда лагает"},
    {"id": "tourette", "label": "Tourette", "hint": "тики не характер"},
    {"id": "pda", "label": "PDA", "hint": "спрос ломает нервную систему"},
    {"id": "rsd", "label": "RSD", "hint": "отказ ощущается как ожог"},
    {"id": "hsp", "label": "HSP", "hint": "слишком много мира сразу"},
    {"id": "2e", "label": "2e / gifted", "hint": "слишком быстро и слишком сложно"},
]

VIBE: list[dict[str, str]] = [
    {"id": "neurospicy", "label": "neurospicy", "hint": "слово 2024+, смысл размыт"},
    {"id": "selfdx", "label": "self-dx friendly", "hint": "диагноз из тредa тоже считается"},
    {"id": "prodx", "label": "есть официальный диагноз", "hint": "бумага от врача"},
    {"id": "latedx", "label": "late-diagnosed", "hint": "узнал(а) о себе после 20"},
    {"id": "masking", "label": "masking exhaustion", "hint": "после людей нужен темноты день"},
    {"id": "infodump", "label": "info-dump welcome", "hint": "специальный интерес = сексуально"},
    {"id": "routines", "label": "routines or death", "hint": "сломали план — сломали человека"},
    {"id": "parallel", "label": "parallel play date", "hint": "молчать в одной комнате — интим"},
    {"id": "nonsmalltalk", "label": "no small talk", "hint": "сразу про смерть и нейромедиаторы"},
    {"id": "overstim", "label": "overstimulation warning", "hint": "бары и open space — нет"},
    {"id": "spoons", "label": "spoon theory", "hint": "сегодня три ложки, не трать"},
    {"id": "anxious-att", "label": "тревожная привязанность", "hint": "прочитал(а) как «онлайн»"},
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

NEURO_IDS = {item["id"] for item in NEURO}
VIBE_IDS = {item["id"] for item in VIBE}
LOOKING_IDS = {item["id"] for item in LOOKING_FOR}
GENDER_IDS = {item["id"] for item in GENDERS}


def catalog_payload() -> dict:
    return {
        "neuro": NEURO,
        "vibe": VIBE,
        "looking_for": LOOKING_FOR,
        "genders": GENDERS,
    }

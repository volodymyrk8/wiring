"""Plain-language expansions for neuro and vibe labels."""

from __future__ import annotations

from html import escape

from catalog import NEURO, VIBE

# Short line for floating tips; blurb is the glossary paragraph.
GLOSS = {
    "asd": {
        "expand": "ASD — Autism Spectrum Disorder, расстройство аутистического спектра",
        "blurb": "Аутичный спектр. Темнота, тишина и специнтересы.",
    },
    "adhd": {
        "expand": "ADHD — Attention-Deficit/Hyperactivity Disorder, СДВГ",
        "blurb": "Сто мыслей в минуту 24/7.",
    },
    "audhd": {
        "expand": "AuDHD — аутизм + СДВГ сразу",
        "blurb": "К-к-комбо! РАС и СДВГ в одном флаконе.",
    },
    "bpd": {
        "expand": "BPD — Borderline Personality Disorder, ПРЛ",
        "blurb": "Интенсивность, крайности и фонтан эмоций.",
    },
    "ocd": {
        "expand": "OCD — Obsessive-Compulsive Disorder, ОКР",
        "blurb": "Мозг требует навязчивых ритуалов.",
    },
    "bipolar": {
        "expand": "БАР — биполярное аффективное расстройство",
        "blurb": "Эра прайма, эра депрессии, и так по кругу.",
    },
    "cptsd": {
        "expand": "CPTSD — Complex PTSD, комплексное ПТСР",
        "blurb": "Всегда настороже из-за длительной травмы.",
    },
    "ptsd": {
        "expand": "PTSD — Post-Traumatic Stress Disorder, ПТСР",
        "blurb": "Вьетнамские флешбэки о пережитых травмах.",
    },
    "anxiety": {
        "expand": "ГТР — generalized anxiety, тревожное расстройство",
        "blurb": "Сто сценариев катастрофы в голове.",
    },
    "social_phobia": {
        "expand": "социальная тревога / социофобия",
        "blurb": "Люди — страшно, вырубай.",
    },
    "depression": {
        "expand": "депрессия",
        "blurb": "Мир в серых тонах.",
    },
    "dyslexia": {
        "expand": "дислексия / дисграфия",
        "blurb": "Собрать буквы — целый квест.",
    },
    "dyspraxia": {
        "expand": "диспраксия",
        "blurb": "Тело иногда лагает.",
    },
    "tourette": {
        "expand": "синдром Туретта",
        "blurb": "Непроизвольные тики.",
    },
    "pda": {
        "expand": "PDA — Pathological Demand Avoidance, избегание требований",
        "blurb": "Любой внешний «надо» может выключить нервную систему. Не упрямство и не лень. Часто рядом с аутизмом.",
    },
    "rsd": {
        "expand": "RSD — Rejection Sensitive Dysphoria",
        "blurb": "Отказ, тон, прочитано-игнор ощущаются как ожог. Не официальный диагноз DSM, частый спутник СДВГ.",
    },
    "hsp": {
        "expand": "HSP — Highly Sensitive Person, высокая чувствительность",
        "blurb": "Не диагноз из справочника. Сильнее бьют звук, свет, чужое настроение. Легко перепутать с аутизмом — не всегда одно и то же.",
    },
    "2e": {
        "expand": "2e — twice-exceptional, дважды исключительный",
        "blurb": "Одарённость и нейроотличие вместе. Быстро схватывает и одновременно спотыкается там, где «всем легко».",
    },
    "neurospicy": {
        "expand": "neurospicy — разговорное «нейро-острое»",
        "blurb": "Сленг, не диагноз. Человек говорит, что проводка не заводская, без длинного списка букв.",
    },
    "selfdx": {
        "expand": "самодиагностика",
        "blurb": "Самостоятельно разбираюсь со своей психикой.",
    },
    "prodx": {
        "expand": "диагноз от психиатра",
        "blurb": "Диагноз подтверждён врачом.",
    },
    "latedx": {
        "expand": "поздняя диагностика",
        "blurb": "Путь к диагнозу был долгим.",
    },
    "neurotraits": {
        "expand": "нейроотличные черты",
        "blurb": "Особенности выражены не ярко.",
    },
    "intherapy": {
        "expand": "в терапии",
        "blurb": "Хожу к психологу или психотерапевту.",
    },
    "burnout": {
        "expand": "выгорание",
        "blurb": "Усталость от жизни среди нейротипиков.",
    },
    "masking": {
        "expand": "masking — социальная маска",
        "blurb": "Держать «нормальное» лицо. Потом нужен день тишины. Не актёрство ради лайков.",
    },
    "infodump": {
        "expand": "info-dump — сбросить специальный интерес",
        "blurb": "Длинный поток про одну тему. Для части людей это близость, не спам.",
    },
    "routines": {
        "expand": "routines — ритуалы и план",
        "blurb": "Сломали расписание — сломали человека. Не про контроль партнёра, про нервную систему.",
    },
    "parallel": {
        "expand": "parallel play — параллельная игра",
        "blurb": "Молчать в одной комнате, каждый за своим. Для многих это свидание, не игнор.",
    },
    "bodydouble": {
        "expand": "body doubling — компания рядом",
        "blurb": "Сидеть рядом и делать своё: учёба, быт, работа. Не обязательно болтать — важно чужое присутствие.",
    },
    "nonsmalltalk": {
        "expand": "no small talk — без «как дела»",
        "blurb": "Сразу про смысл, смерть, нейромедиаторы. Small talk стоит ложек.",
    },
    "overstim": {
        "expand": "overstimulation — перегруз",
        "blurb": "Слишком много звука, света, людей. Бар и open space часто красный флаг, не «давай вечерком».",
    },
    "spoons": {
        "expand": "spoons — теория ложек",
        "blurb": "Единица дневной энергии. «Сегодня три ложки» значит: не трать меня на мелочи.",
    },
    "anxious-att": {
        "expand": "тревожная привязанность",
        "blurb": "Тишина в чате читается как отказ. Нужны ясность и не игра в недоступность.",
    },
    "avoidant-att": {
        "expand": "избегающая привязанность",
        "blurb": "Сближение пугает. Пропал — не всегда «не интересно», иногда батарея и страх.",
    },
    "disorg-att": {
        "expand": "дезорганизованная привязанность",
        "blurb": "Подойди / отойди одновременно. Часто из ранней непредсказуемой близости.",
    },
    "ace": {
        "expand": "ace / demi / aro — асексуальный, деми, аромантичный спектр",
        "blurb": "Секс или романтика не обязательный пункт. Можно быть здесь и без этого DLC.",
    },
    "enby": {
        "expand": "enby — non-binary, небинарность",
        "blurb": "Не мужчина и не женщина, или не в этой рамке. they/она/он — смотри, как просят.",
    },
    "empath": {
        "expand": "высокая эмпатия",
        "blurb": "Тонкая настройка на чувства и эмоции.",
    },
    "secure-att": {
        "expand": "надёжная привязанность",
        "blurb": "Стабильность в отношениях.",
    },
    "online-only": {
        "expand": "только онлайн",
        "blurb": "Хочу общаться только в интернете.",
    },
    "offline-ok": {
        "expand": "возможен оффлайн",
        "blurb": "Не против встретиться лично.",
    },
    "no-voice": {
        "expand": "без голосовых",
        "blurb": "Только текстом.",
    },
    "voice-ok": {
        "expand": "с голосовыми",
        "blurb": "Люблю говорить и слушать.",
    },
    "terminally-online": {
        "expand": "terminally online — слишком в сети",
        "blurb": "Референсы быстрее речи. Нормально, если мемы — родной язык.",
    },
    "softlaunch": {
        "expand": "soft launch — без парных сторис",
        "blurb": "Отношения не для ленты. Не скрытность «есть ещё кто-то», а приватность.",
    },
    "healing": {
        "expand": "healing era — период восстановления",
        "blurb": "Терапия, пауза, аккуратно. Не обещание «я уже починился(ась)».",
    },
    "trauma-informed": {
        "expand": "trauma-informed — с учётом травмы",
        "blurb": "Триггеры лучше сказать заранее. Без «да ладно, это же просто шутка».",
    },
    "hyperfix": {
        "expand": "hyperfixation — гиперакцент",
        "blurb": "Три недели одна тема, потом другая. Искать напарника по одержимости, не слушателя из вежливости.",
    },
    "voicenotes": {
        "expand": "голосовые вместо текста",
        "blurb": "Печатать — работа. Голос быстрее. Спроси, ок ли слушать в автобусе.",
    },
    "just-a-little": {
        "expand": "just a little autistic — «немножко»",
        "blurb": "Ирония и мем. Иногда правда про маску, иногда человек ещё не нашёл своих букв.",
    },
}


def tip_for(item: dict) -> str:
    # Short hover tip: prefer the chip hint; caption still uses expand + blurb.
    hint = (item.get("hint") or "").strip()
    if hint:
        return hint
    extra = GLOSS.get(item["id"], {})
    return (extra.get("expand") or "").strip()


def enrich(items: list[dict]) -> list[dict]:
    out = []
    for item in items:
        extra = GLOSS.get(item["id"], {})
        out.append({**item, "expand": extra.get("expand") or "", "blurb": extra.get("blurb") or item.get("hint") or "", "tip": tip_for(item)})
    return out


def glossary_html() -> str:
    blocks = [
        "<p>Особенности на анкетах — чтобы договориться о языке, не чтобы поставить диагноз. "
        "Это не учебник и не замена врачу. Self-dx на сайте считается.</p>",
        "<p>Наведи или нажми на тег в ленте — всплывёт коротко. Ниже — та же расшифровка списком.</p>",
    ]
    for title, items in (("нейротипы и расстройства", NEURO), ("вайб и сленг", VIBE)):
        blocks.append(f"<h2>{escape(title)}</h2>")
        for item in enrich(items):
            blocks.append(
                "<article class=\"abbr\" id=\""
                + escape(item["id"])
                + "\">"
                + "<h3>"
                + escape(item["label"])
                + "</h3>"
                + ("<p class=\"expand\">" + escape(item["expand"]) + "</p>" if item["expand"] else "")
                + "<p>"
                + escape(item["blurb"])
                + "</p></article>"
            )
    return "\n".join(blocks)

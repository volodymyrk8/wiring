#!/usr/bin/env python3
"""Extra local test users + sample chats for Дев (see README). Idempotent."""

from __future__ import annotations

import os
import sys
import time

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPTS_DIR)
for path in (ROOT, SCRIPTS_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)

from werkzeug.security import generate_password_hash

from ensure_dev_user import DEV_USER_EMAIL, DEV_USER_PASSWORD

CHAT_PARTNERS = 7
MESSAGES_PER_CHAT = 10

# 10 filled profiles (@wiring.test, password wiring-dev). First 7 get chats with Дев.
EXTRA_USERS: list[dict] = [
    {
        "email": "alma@wiring.test",
        "name": "Алма",
        "age": 24,
        "gender": "woman",
        "city": "Нови-Сад",
        "bio": "СДВГ, живу в таблицах и ночных прогулках. Ищу человека без small talk.",
        "photo": "portraits/p03.jpg",
        "job": "аналитика",
        "neuro": ["adhd"],
        "vibe": ["nonsmalltalk", "bodydouble"],
    },
    {
        "email": "boris@wiring.test",
        "name": "Борис",
        "age": 31,
        "gender": "man",
        "city": "Белград",
        "bio": "AuDHD, код и кофе. Могу пропасть на день — это не игнор.",
        "photo": "portraits/p04.jpg",
        "job": "бэкенд",
        "neuro": ["audhd"],
        "vibe": ["terminally-online", "infodump"],
    },
    {
        "email": "cora@wiring.test",
        "name": "Кора",
        "age": 22,
        "gender": "woman",
        "city": "Нови-Сад",
        "bio": "аутизм + HSP. Тихие свидания > шумные бары.",
        "photo": "portraits/p05.jpg",
        "job": "иллюстрация",
        "neuro": ["asd", "hsp"],
        "vibe": ["parallel", "overstim"],
    },
    {
        "email": "dima@wiring.test",
        "name": "Дима",
        "age": 28,
        "gender": "man",
        "city": "Будапешт",
        "bio": "тревожное + late dx. Лучше пиши текстом, звонки по договорённости.",
        "photo": "portraits/p06.jpg",
        "job": "редактура",
        "neuro": ["anxiety"],
        "vibe": ["latedx", "trauma-informed"],
    },
    {
        "email": "eva@wiring.test",
        "name": "Ева",
        "age": 26,
        "gender": "woman",
        "city": "Нови-Сад",
        "bio": "ОКР и любовь к спискам. Если договорились на 19:00 — это 19:00.",
        "photo": "portraits/p07.jpg",
        "job": "дизайн",
        "neuro": ["ocd"],
        "vibe": ["routines", "nonsmalltalk"],
    },
    {
        "email": "fox@wiring.test",
        "name": "Фокс",
        "age": 29,
        "gender": "nb",
        "city": "Берлин",
        "bio": "they/она. BPD-friendly режим: честно и без пассивной агрессии.",
        "photo": "portraits/p08.jpg",
        "job": "музыка",
        "neuro": ["bpd"],
        "vibe": ["enby", "healing"],
    },
    {
        "email": "gita@wiring.test",
        "name": "Гита",
        "age": 33,
        "gender": "woman",
        "city": "Нови-Сад",
        "bio": "КПТСР, медленно сближаюсь. Спасибо за терпение.",
        "photo": "portraits/p09.jpg",
        "job": "психология учёба",
        "neuro": ["cptsd"],
        "vibe": ["trauma-informed", "softlaunch"],
    },
    {
        "email": "hugo@wiring.test",
        "name": "Хьюго",
        "age": 27,
        "gender": "man",
        "city": "Белград",
        "bio": "депрессия в ремиссии, spoon theory на каждый день.",
        "photo": "portraits/p01.jpg",
        "job": "фото",
        "neuro": ["depression"],
        "vibe": ["spoons", "parallel"],
    },
    {
        "email": "ira@wiring.test",
        "name": "Ира",
        "age": 25,
        "gender": "woman",
        "city": "Вильнюс",
        "bio": "RSD + СДВГ. Если долго не отвечаю — скорее перегруз, не обида.",
        "photo": "portraits/p02.jpg",
        "job": "переводы",
        "neuro": ["adhd", "rsd"],
        "vibe": ["neurospicy", "voicenotes"],
    },
    {
        "email": "jura@wiring.test",
        "name": "Юра",
        "age": 30,
        "gender": "man",
        "city": "Нови-Сад",
        "bio": "2e, гиперфикс на поездах и расписаниях.",
        "photo": "portraits/p03.jpg",
        "job": "логистика",
        "neuro": ["2e"],
        "vibe": ["hyperfix", "infodump"],
    },
]

# 7 threads × 10 lines; True = from chat partner, False = from Дев.
CHAT_SCRIPTS: list[list[tuple[bool, str]]] = [
    [
        (True, "привет! увидела твою анкету — тоже без small talk"),
        (False, "привет, Алма. да, сразу по делу ок"),
        (True, "как тебе писать: коротко или можно простыни?"),
        (False, "можно и длинно, главное без «как дела» ради галочки"),
        (True, "супер. я сегодня в 19:00 свободна, прогулка у Дунав"),
        (False, "звучит норм. напиши точку встречи, я люблю когда план ясен"),
        (True, "мост на Петровардин, у входа в парк"),
        (False, "ок, буду. если опоздаю — напишу, не буду молчать"),
        (True, "договорились 🤝"),
        (False, "до вечера"),
    ],
    [
        (True, "йо, ты тоже audhd? редко встречаю в ленте"),
        (False, "да. два режима: либо код 6 часов, либо лежу"),
        (True, "знакомо. body doubling иногда спасает"),
        (False, "можем попробовать созвон без камеры, каждый за своим"),
        (True, "давай в среду вечером"),
        (False, "среда ок. кину ссылку ближе к времени"),
        (True, "кстати, что сейчас в гиперфиксе?"),
        (False, "postgres и миграции, скучно но приятно"),
        (True, "ахах, мой сейчас — расписания поездов"),
        (False, "уважаю. скинь потом табличку, посмотрю"),
    ],
    [
        (True, "привет. ты из Нови-Сада? я тут недавно"),
        (False, "да, живу тут. если нужны тихие места — подскажу"),
        (True, "да! бары не мой формат"),
        (False, "есть кафе без музыки днём, и парк у крепости"),
        (True, "парк звучит идеально"),
        (False, "можем parallel play: сидим, каждый в телефоне/книге"),
        (True, "мечта. когда удобно?"),
        (False, "суббота после 15:00"),
        (True, "записала. возьму плед на всякий"),
        (False, "я тоже. напишу утром в субботу"),
    ],
    [
        (True, "привет, Дев. тревожник в чате 🙃"),
        (False, "привет. я за ясные договорённости — помогает обоим"),
        (True, "если не отвечаешь час — мозг рисует катастрофу"),
        (False, "понимаю. могу кидать «занят, вернусь к X»"),
        (True, "это было бы супер"),
        (False, "ок. как насчёт обмена плейлистами вместо звонка?"),
        (True, "да! кинь что слушаешь когда фоном работаешь"),
        (False, "lo-fi без вокала и ambient. скину ссылку"),
        (True, "спасибо, послушаю сегодня"),
        (False, "и ты скинь — добавлю в ротацию"),
    ],
    [
        (True, "привет. у тебя в анкете про списки — это про меня"),
        (False, "привет, Ева. списки = спокойствие"),
        (True, "можно спросить про формат свидания?"),
        (False, "лучше заранее: где, во сколько, сколько по времени"),
        (True, "идеально. 1.5 часа кофе ок?"),
        (False, "да. если захочу уйти раньше — скажу честно"),
        (True, "и я. без обид"),
        (False, "тогда вторник 17:30, кофейня у центра?"),
        (True, "подходит. напишу за час"),
        (False, "договорились"),
    ],
    [
        (True, "hey, they/она тоже? рада match"),
        (False, "привет. да, на «ты» ок?"),
        (True, "конечно. как тебе границы в переписке?"),
        (False, "не люблю ночные «ты спишь?» без контекста"),
        (True, "согласна. днём пишу чаще"),
        (False, "если тяжёлый день — могу одним словом «выжил»"),
        (True, "это норм, не буду требовать эссе"),
        (False, "спасибо. хочешь обменяться любимыми мемами про нейро?"),
        (True, "давай 😂"),
        (False, "кину первым через минуту"),
    ],
    [
        (True, "привет. медленно сближаюсь, если что"),
        (False, "привет, Гита. темп твой, без давления"),
        (True, "спасибо. можно сначала просто текстом неделю?"),
        (False, "да. голос/видео только когда захочешь"),
        (True, "ок. чем занимаешься сегодня?"),
        (False, "локальный dev и тесты чатов, скучно но нужно"),
        (True, "звучит знакомо. я учебу и прогулки чередую"),
        (False, "хороший баланс. расскажешь про любимый маршрут?"),
        (True, "длинная набережная, мало людей утром"),
        (False, "запишу. может как-нибудь пересечёмся там"),
    ],
]


def seed_test_social(conn, dev_id: int) -> None:
    from app import _attach_portrait, replace_tags

    pw_hash = generate_password_hash(DEV_USER_PASSWORD, method="pbkdf2:sha256")
    now = int(time.time())
    partner_ids: list[int] = []

    for spec in EXTRA_USERS:
        row = conn.execute("SELECT id FROM users WHERE email = ?", (spec["email"],)).fetchone()
        if row:
            uid = int(row["id"])
            conn.execute(
                """
                UPDATE users SET
                    password_hash = ?, name = ?, age = ?, city = ?, gender = ?,
                    looking_for = 'everyone', bio = ?, photo = ?, job = ?, intent = 'dating',
                    special_data_consent_at = ?, photo_rights_consent_at = ?,
                    privacy_accepted_at = COALESCE(privacy_accepted_at, ?),
                    email_verified_at = COALESCE(email_verified_at, ?),
                    onboard_done = 1, is_seed = 0, last_seen = ?
                WHERE id = ?
                """,
                (
                    pw_hash,
                    spec["name"],
                    spec["age"],
                    spec["city"],
                    spec["gender"],
                    spec["bio"],
                    spec["photo"],
                    spec.get("job", ""),
                    now,
                    now,
                    now,
                    now,
                    now,
                    uid,
                ),
            )
        else:
            cur = conn.execute(
                """
                INSERT INTO users (
                    email, password_hash, name, age, city, gender, looking_for, bio, photo,
                    job, intent, height, communication, privacy_accepted_at,
                    special_data_consent_at, photo_rights_consent_at, marketing_consent_at,
                    email_verified_at, onboard_done, is_seed, created_at, last_seen
                )
                VALUES (?, ?, ?, ?, ?, ?, 'everyone', ?, ?, ?, 'dating', NULL, '', ?, ?, ?, NULL, ?, 1, 0, ?, ?)
                """,
                (
                    spec["email"],
                    pw_hash,
                    spec["name"],
                    spec["age"],
                    spec["city"],
                    spec["gender"],
                    spec["bio"],
                    spec["photo"],
                    spec.get("job", ""),
                    now,
                    now,
                    now,
                    now,
                    now,
                    now,
                ),
            )
            uid = int(cur.lastrowid)
        replace_tags(conn, uid, spec["neuro"], spec["vibe"])
        _attach_portrait(conn, uid, spec["photo"])
        partner_ids.append(uid)

    chat_ids = partner_ids[:CHAT_PARTNERS]
    for other_id in chat_ids:
        for a, b in ((dev_id, other_id), (other_id, dev_id)):
            conn.execute(
                """
                INSERT INTO swipes (from_id, to_id, direction, created_at)
                VALUES (?, ?, 'like', ?)
                ON CONFLICT(from_id, to_id) DO UPDATE SET direction = excluded.direction
                """,
                (a, b, now),
            )

    for idx, other_id in enumerate(chat_ids):
        conn.execute(
            "DELETE FROM messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)",
            (dev_id, other_id, other_id, dev_id),
        )
        script = CHAT_SCRIPTS[idx]
        base = now - 86400 * (CHAT_PARTNERS - idx)
        for n, (from_peer, body) in enumerate(script[:MESSAGES_PER_CHAT]):
            sender = other_id if from_peer else dev_id
            recipient = dev_id if from_peer else other_id
            ts = base + n * 420
            conn.execute(
                "INSERT INTO messages (from_id, to_id, body, created_at) VALUES (?, ?, ?, ?)",
                (sender, recipient, body, ts),
            )
        last = conn.execute(
            "SELECT MAX(id) AS id FROM messages WHERE from_id = ? AND to_id = ? OR from_id = ? AND to_id = ?",
            (dev_id, other_id, other_id, dev_id),
        ).fetchone()
        max_id = int(last["id"] or 0) if last else 0
        conn.execute(
            """
            INSERT INTO reads (user_id, other_id, last_read_id) VALUES (?, ?, ?)
            ON CONFLICT(user_id, other_id) DO UPDATE SET last_read_id = excluded.last_read_id
            """,
            (dev_id, other_id, max_id),
        )

    print(
        f"test social: {len(EXTRA_USERS)} profiles, {len(chat_ids)} chats × {MESSAGES_PER_CHAT} msgs for dev"
    )


def main() -> None:
    from app import app, init_db, db

    init_db()
    with app.app_context():
        conn = db()
        row = conn.execute("SELECT id FROM users WHERE email = ?", (DEV_USER_EMAIL,)).fetchone()
        if not row:
            print("run ensure_dev_user first")
            raise SystemExit(1)
        seed_test_social(conn, int(row["id"]))
        conn.commit()


if __name__ == "__main__":
    main()

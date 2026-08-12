# WIRING

Нишевый MVP дейтинга для нейроотличных: регистрация, теги (ASD, ADHD, ПРЛ и современная классификация), фильтры, свайп, мэтчи.

Публично: https://lizaisyourfriend.lol/dating/

## Local

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python3 app.py
```

Открой http://127.0.0.1:5070/ — кнопка «свайпать сразу» логинит демо-профиль.

```sh
python3 -m unittest discover -s tests -q
```

## Deploy

```sh
./deploy.sh
```

Кладёт сервис на `127.0.0.1:5070`, nginx — на `/dating/`.

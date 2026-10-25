"""Russian/English UI copy. Profile text and messages are never translated here."""
from __future__ import annotations

from contextvars import ContextVar
from contextlib import contextmanager
from html import escape
from html.parser import HTMLParser
import json
from pathlib import Path
import re

_MESSAGES = json.loads((Path(__file__).parent / 'locales/en.json').read_text())
_override = ContextVar('wiring_language', default=None)
LANGUAGES = ('ru', 'en')

def get_language():
    override = _override.get()
    if override in LANGUAGES:
        return override
    from flask import has_request_context, request
    if has_request_context():
        for value in (request.headers.get('X-Wiring-Language'), request.args.get('lang'), request.cookies.get('wiring-language')):
            if value in LANGUAGES:
                return value
    return 'ru'

@contextmanager
def use_language(language):
    token = _override.set(language if language in LANGUAGES else 'ru')
    try:
        yield
    finally:
        _override.reset(token)

def tr(source, *values, language=None):
    source = str(source)
    key = re.sub(r'\s+', ' ', source).strip()
    translated = _MESSAGES.get(key) if (language or get_language()) == 'en' else None
    text = source if translated is None else re.match(r'^\s*', source)[0] + translated + re.search(r'\s*$', source)[0]
    return re.sub(r'\{(\d+)\}', lambda m: str(values[int(m[1])]) if int(m[1]) < len(values) else m[0], text)

class _EditorialHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.parts = []
    def handle_starttag(self, tag, attrs):
        self.parts.append('<' + tag + ''.join(' ' + key + ('="' + escape(tr(value) if key in ('title', 'aria-label') else value, quote=True) + '"' if value is not None else '') for key, value in attrs) + '>')
    def handle_endtag(self, tag): self.parts.append('</' + tag + '>')
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs); self.parts[-1] = self.parts[-1][:-1] + '/>'
    def handle_data(self, data): self.parts.append(escape(tr(data), quote=False))
    def handle_entityref(self, name): self.parts.append('&' + name + ';')
    def handle_charref(self, name): self.parts.append('&#' + name + ';')

def editorial_html(source):
    """Only for our static legal/glossary copy, never for user-supplied HTML."""
    if get_language() != 'en': return source
    source = re.sub(r'<section lang="en"[^>]*>.*?</section>', '', source, flags=re.S)
    parser = _EditorialHTML(); parser.feed(source)
    return ''.join(parser.parts)

def catalog_copy(value):
    if isinstance(value, list): return [catalog_copy(item) for item in value]
    if isinstance(value, dict):
        return {key: tr(item) if key in ('label', 'name', 'hint', 'expand', 'blurb', 'tip') and isinstance(item, str) else catalog_copy(item) for key, item in value.items()}
    return value

def install(app):
    from flask import request
    app.jinja_env.filters['localized_html'] = editorial_html
    @app.context_processor
    def language_context():
        return {'_': tr, 'language': get_language()}
    @app.after_request
    def language_response(response):
        language = get_language()
        if request.args.get('lang') in LANGUAGES:
            response.set_cookie('wiring-language', language, max_age=31536000, samesite='Lax', secure=request.is_secure)
        if response.mimetype in ('text/html', 'application/json'):
            response.headers['Content-Language'] = language
            response.vary.add('Cookie'); response.vary.add('X-Wiring-Language')
        if response.is_json and language == 'en':
            data = response.get_json()
            if isinstance(data, dict):
                if isinstance(data.get('error'), str): data['error'] = tr(data['error'])
                if request.path.endswith('/api/catalog'): data = catalog_copy(data)
                for field in ('user', 'peer'):
                    if isinstance(data.get(field), dict) and data[field].get('report_ban_message'):
                        data[field]['report_ban_message'] = tr(data[field]['report_ban_message'])
                response.set_data(json.dumps(data, ensure_ascii=False))
        return response

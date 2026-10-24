import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// Full SPA, synthetic accounts, delayed APIs/media; no production requests.
const root = new URL('../', import.meta.url);
const calls = [];
let failFeed = false;
const user = {id:99,name:'Локальный профиль',age:29,city:'Белград',gender:'woman',looking_for:'everyone',bio:'Тест',neuro:['asd'],vibe:[],photos:[],prompts:[],needs_profile:false,needs_photo_consent:false,needs_special_consent:false};
const catalog = {places:[{country:'Сербия',cities:['Белград']}],neuro:[{id:'asd',label:'Аутизм'}],vibe:[{id:'bodydouble',label:'боди-даблинг партнёр'}],intents:[{id:'bodydouble',label:'body-doubling партнер'}],genders:[{id:'woman',label:'женщина'}],looking_for:[{id:'everyone',label:'всех'}],prompts:[],limits:{photos:6}};
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/styles.css"></head><body><div id="app" data-base=""></div><script type="module" src="/public/dist/app.js"></script></body></html>';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/fixture/photo.svg') {
    await sleep(3500);
    res.setHeader('Content-Type','image/svg+xml');
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="600"><rect width="300" height="600" fill="#9988aa"/></svg>');
  }
  if (url.pathname.startsWith('/api/')) {
    calls.push({path:url.pathname,query:Object.fromEntries(url.searchParams),method:req.method});
    let data = {ok:true};
    if (url.pathname === '/api/catalog') data = {...data,...catalog};
    else if (url.pathname === '/api/me') data.user = user;
    else if (url.pathname === '/api/inbox') Object.assign(data,{likes_in:0,unread:0,unread_chats:0,notices:[]});
    else if (url.pathname === '/api/matches') {
      await sleep(1400);
      data.matches = [{id:2,name:'Ада',age:29,last_message:'Последнее сообщение',last_at:1720000000,unread:0}];
    } else if (url.pathname === '/api/messages/2') {
      data.peer = {id:2,name:'Ада'};
      data.messages = Array.from({length:100},(_,i)=>({id:i+1,from_id:2,body:'Сообщение '+(i+1),created_at:1720000000,...(i===98?{photo_url:'/fixture/photo.svg?session='+url.search}: {})}));
    } else if (url.pathname === '/api/feed') {
      if (failFeed && url.searchParams.has('vibe')) {res.statusCode=503;data={ok:false,error:'Тестовая ошибка загрузки'};}
      else Object.assign(data,{cards:[],has_more:false,generation:0});
    }
    res.setHeader('Content-Type','application/json');
    return res.end(JSON.stringify(data));
  }
  if (!url.pathname.startsWith('/public/')) {res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  try {
    res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'application/octet-stream');
    res.end(await readFile(new URL(url.pathname.slice(1),root)));
  } catch {res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(process.env.MANUAL_QA ? 5071 : 0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
if (process.env.MANUAL_QA) console.log('Synthetic SPA ready: '+origin+'/feed');
else {
  let browser;
  try {
    const {chromium} = await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(origin+'/chats');
    await page.getByRole('status').filter({hasText:'Загружаем чаты'}).waitFor();
    assert.equal(await page.getByText('Первый мэтч — уже начало',{exact:true}).count(),0);
    await page.locator('.match').filter({hasText:'Ада'}).waitFor();
    await page.locator('.match').filter({hasText:'Ада'}).click();
    await page.locator('[data-msg="100"]').waitFor();
    const gap=()=>page.locator('.thread').evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop);
    await page.waitForTimeout(4500);
    assert.ok(await gap()<3,'late photo above the last message must preserve the bottom');
    await page.locator('.thread').evaluate(el=>el.scrollTop=0);
    await page.waitForTimeout(150);
    await page.setViewportSize({width:390,height:600});
    await page.waitForTimeout(150);
    assert.ok(await gap()>500,'resizing must preserve reading older messages');
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ9kAAAAASUVORK5CYII=','base64');
    await page.locator('input[type=file]').setInputFiles({name:'one.png',mimeType:'image/png',buffer:png});
    await page.getByRole('dialog',{name:'Отправить фото',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Отправить вместе',exact:true}).count(),0);
    await page.getByRole('button',{name:'Отправить',exact:true}).waitFor();
    await page.getByRole('button',{name:'Отмена',exact:true}).click();
    assert.equal(calls.filter(c=>c.path==='/api/messages/photo').length,0);
    await page.goto(origin+'/feed');
    const openFilters=()=>page.getByRole('button',{name:/^Фильтры/}).click();
    await openFilters();
    await page.getByRole('group',{name:'Вайб',exact:true}).getByRole('button',{name:/боди-даблинг/}).click();
    await page.getByRole('checkbox',{name:'Скрыть анкеты без диагноза'}).uncheck();
    await page.getByRole('button',{name:'Применить',exact:true}).click();
    await page.getByRole('dialog',{name:'Фильтры',exact:true}).waitFor({state:'hidden'});
    assert.ok(calls.some(c=>c.path==='/api/feed'&&c.query.vibe==='bodydouble'&&c.query.hide_empty==='0'));
    await page.reload();await openFilters();
    assert.equal(await page.getByRole('checkbox',{name:'Скрыть анкеты без диагноза'}).isChecked(),false);
    assert.equal(await page.getByRole('group',{name:'Вайб',exact:true}).getByRole('button',{name:/боди-даблинг/}).getAttribute('aria-pressed'),'true');
    failFeed=true;
    await page.getByRole('button',{name:'Применить',exact:true}).click();
    await page.getByRole('dialog',{name:'Фильтры',exact:true}).getByRole('alert').waitFor();
    failFeed=false;
    await page.getByRole('button',{name:'Применить',exact:true}).click();
    await page.getByRole('dialog',{name:'Фильтры',exact:true}).waitFor({state:'hidden'});
    await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='wiring-deck-filters')throw new DOMException('Full','QuotaExceededError');return original.call(this,key,value);};});
    await openFilters();
    await page.getByRole('checkbox',{name:'Скрыть анкеты без диагноза'}).check();
    await page.getByRole('button',{name:'Применить',exact:true}).click();
    await page.getByRole('dialog',{name:'Фильтры',exact:true}).waitFor({state:'hidden'});
    assert.deepEqual(errors,[]);
    console.log('Trello regressions passed: loading chats, delayed photos/bottom, reader position, single photo, filters/query/reload/error retry/storage failure');
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
}

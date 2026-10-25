import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
const root=new URL('../',import.meta.url);
const baseline=process.env.PUBLISHED_BASELINE==='1';
const published=baseline||process.env.PUBLISHED_ASSETS==='1';
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/styles.css"></head><body><div id="app" data-base=""></div><script type="module" src="/public/dist/app.js"></script></body></html>';
const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(['/','/me','/me/edit','/feed'].includes(url.pathname)){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}if(!url.pathname.startsWith('/public/dist/')&&url.pathname!=='/public/styles.css'){res.writeHead(404);return res.end();}try{res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');res.end(published?await (await fetch('https://wiring.club'+url.pathname+url.search)).text():await readFile(new URL(url.pathname.slice(1),root)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const origin='http://127.0.0.1:'+server.address().port;
 const user={id:99,name:'Локальный профиль',age:29,city:'Белград',job:'Клинический психолог',gender:'woman',looking_for:'everyone',bio:'Описание локального профиля',neuro:['asd'],vibe:[],photos:[],prompts:[],needs_profile:false,needs_photo_consent:false,needs_special_consent:false};
 const catalog={places:[{country:'Сербия',cities:['Белград']}],neuro:[{id:'asd',label:'Аутизм'}],vibe:[],intents:[],genders:[{id:'woman',label:'женщина'}],looking_for:[{id:'everyone',label:'всех'}],prompts:[],limits:{photos:6}};
 const calls=[];
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname.startsWith('/api/')){calls.push({path:url.pathname,method:route.request().method()});const data=url.pathname==='/api/catalog'?{ok:true,...catalog}:url.pathname==='/api/me'?{ok:true,user}:url.pathname==='/api/inbox'?{ok:true,likes_in:0,unread:0,unread_chats:0,notices:[]}:url.pathname.startsWith('/api/people/')?{ok:true,person:user}:{ok:true,cards:[],has_more:false,matches:[]};return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});}return route.continue();});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/me');
 if(baseline){await page.getByRole('textbox',{name:'Имя',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/me');console.log('Published regression reproduced: /me directly mounts the editor with a synthetic account');}
 else {
 await page.getByRole('link',{name:'Редактировать анкету',exact:true}).waitFor();
 await page.getByText('Занятость: Клинический психолог',{exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Локальный профиль, 29',exact:true}).locator('..').innerText().then(text=>text.includes(user.job)),false);
 assert.equal(await page.locator('#profile-feature-root').count(),0,'/me initially renders preview, without mounting the editor');
 assert.equal(await page.locator('textarea[name=bio]').count(),0);
 assert.equal(new URL(page.url()).pathname,'/me');
 await page.getByRole('link',{name:'Редактировать анкету',exact:true}).click();
 await page.locator('#profile-feature-root').waitFor();
 assert.equal(new URL(page.url()).pathname,'/me/edit');
 await page.getByRole('textbox',{name:'Имя',exact:true}).waitFor();
 await page.goBack();await page.getByRole('link',{name:'Редактировать анкету',exact:true}).waitFor();
 assert.equal(new URL(page.url()).pathname,'/me');
 await page.getByRole('link',{name:'Редактировать анкету',exact:true}).click();
 await page.getByRole('textbox',{name:'Имя',exact:true}).waitFor();
 await page.getByRole('button',{name:'Меню профиля',exact:true}).click();
 await page.getByRole('menuitem',{name:'Профиль',exact:true}).click();
 await page.getByRole('link',{name:'Редактировать анкету',exact:true}).waitFor();
 assert.equal(new URL(page.url()).pathname,'/me');
 await page.getByRole('link',{name:'Редактировать анкету',exact:true}).click();
 await page.getByRole('textbox',{name:'Имя',exact:true}).waitFor();
 await page.reload();await page.getByRole('textbox',{name:'Имя',exact:true}).waitFor();
 await page.locator('.tabbar a[data-nav=profile]').click();
 await page.getByRole('link',{name:'Редактировать анкету',exact:true}).waitFor();
 assert.equal(new URL(page.url()).pathname,'/me');
 assert.equal(await page.locator('#profile-feature-root').count(),0);
 assert.equal(calls.filter(c=>c.method==='PATCH').length,0,'opening preview or editor must not save the profile');
 assert.deepEqual(errors,[]);
 await page.screenshot({path:'/tmp/wiring-own-preview.png'});
 console.log('Own profile: initial preview, explicit editor, direct editor reload, browser back, menu and profile-tab return passed');
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}

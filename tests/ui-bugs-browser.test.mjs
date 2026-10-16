import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const root = new URL('../',import.meta.url);
const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/styles.css"></head><body><div id="app"><div id="feature"></div></div><script type="module">
const screen = new URLSearchParams(location.search).get('screen');
document.documentElement.dataset.view=screen;
const mod = await import('/public/dist/'+screen+'.js');
window.test={calls:[],actions:[],navigation:[],fail:false,delay:false,resolve:null};
const person={id:2,name:'Ада',age:29,neuro:[],vibe:[],bio:'Описание '.repeat(80),prompts:[]};
const likes=[person,{id:3,name:'Лео',age:30},{hidden:true}];
const matches=[{id:2,name:'Ада',age:29,unread:2,last_message:'Привет',last_at:1720000000}];
const user={id:99,name:'Тест',age:28,plus:true,neuro:[],vibe:[],photos:[],city:'Белград'};
const host={user,person,personFrom:'recommendations',mode:'matches',catalog:{places:[{country:'Сербия',cities:['Белград']},{country:'Черногория',cities:['Подгорица']}]},likes,matches,filters:{neuro:[],vibe:[],intents:[],min_age:18,max_age:99,city:''},basePath:'',matchesCount:0,
hrefFor:v=>'/'+v,navigate:v=>window.test.navigation.push(v),toast:()=>{},onLogout:()=>{},onUserUpdated:()=>{},onAction:id=>window.test.actions.push(id),loadLikes:async()=>({likes}),refreshUser:async()=>user,
api:async(path,init)=>{window.test.calls.push({path,body:init?.body});if(path==='/api/swipe'){if(window.test.fail)throw Error('Локальная ошибка');if(window.test.delay)await new Promise(resolve=>window.test.resolve=resolve);return {matched:true}};return {matches,user}},swipe:async()=>{}};
window.test.unmount = mod[{likes:'mountLikes',person:'mountPerson',profile:'mountProfile',chat:'mountChat'}[screen]](document.getElementById('feature'),host);
</script></body></html>`;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture);return;}
 if(!['/public/styles.css','/public/dist/likes.js','/public/dist/person.js','/public/dist/profile.js','/public/dist/chat.js'].includes(url.pathname)){res.writeHead(404);res.end();return;}
 try{res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile(new URL(url.pathname.slice(1),root)));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const origin='http://127.0.0.1:'+server.address().port;
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const open=async(screen)=>{await page.goto(origin+'/?screen='+screen);await page.waitForFunction(()=>Boolean(window.test?.unmount));};
 await open('likes');
 assert.equal(await page.getByRole('button',{name:/^Лайк:/}).count(),2);
 await page.getByRole('button',{name:'Скрыть: Ада',exact:true}).click();
 await page.getByRole('button',{name:'Отмена',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.test.calls.filter(c=>c.path==='/api/swipe').length),0);
 await page.getByRole('button',{name:'Скрыть: Ада',exact:true}).click();
 await page.getByRole('button',{name:'Исключить',exact:true}).click();
 await page.waitForFunction(()=>window.test.actions.length===1);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(window.test.calls.find(c=>c.path==='/api/swipe').body)),{target_id:2,direction:'pass'});
 assert.equal(await page.getByRole('button',{name:'Лайк: Ада',exact:true}).count(),0);
 await page.evaluate(()=>window.test.fail=true);
 await page.getByRole('button',{name:'Лайк: Лео',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Локальная ошибка'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Лайк: Лео',exact:true}).count(),1);
 await page.evaluate(()=>{window.test.fail=false;window.test.delay=true;});
 await page.getByRole('button',{name:'Лайк: Лео',exact:true}).click();
 await page.waitForFunction(()=>Boolean(window.test.resolve));
 assert.equal(await page.getByRole('button',{name:'Лайк: Лео',exact:true}).isDisabled(),true);
 await page.evaluate(()=>window.test.resolve());
 await page.waitForFunction(()=>window.test.actions.length===2);
 assert.equal(await page.getByRole('button',{name:/^Лайк:/}).count(),0);
 await open('likes');await page.evaluate(()=>window.test.delay=true);
 await page.getByRole('button',{name:'Лайк: Ада',exact:true}).click();
 await page.waitForFunction(()=>Boolean(window.test.resolve));
 await page.evaluate(()=>{window.test.unmount();window.test.resolve();});
 await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>window.test.actions),[]);
 await open('person');
 const backs=page.getByRole('link',{name:'назад',exact:true});
 assert.equal(await backs.count(),2);await backs.last().click();
 assert.deepEqual(await page.evaluate(()=>window.test.navigation),['recommendations']);
 await open('profile');await page.getByRole('button',{name:'Страна',exact:true}).click();
 await page.getByRole('textbox',{name:'Найти страну',exact:true}).fill('черно');
 await page.waitForFunction(()=>document.querySelectorAll('[role=option]').length===1);
 assert.equal(await page.locator('[role=listbox] [role=option]').count(),1);
 await page.locator('[role=listbox] [role=option]').filter({hasText:'Черногория'}).click();
 await page.waitForFunction(()=>document.querySelector('#profile-country')?.textContent.includes('Черногория'));
 assert.match(await page.getByRole('button',{name:'Страна',exact:true}).innerText(),/Черногория/);
 await open('chat');
 const row=page.locator('.match');const badge=row.locator('span').filter({hasText:/^2$/});
 const geometry=await badge.evaluate(el=>{const b=el.getBoundingClientRect(),r=el.closest('a').getBoundingClientRect();const range=document.createRange();range.selectNodeContents(el);const t=range.getBoundingClientRect();return {b:{x:b.x,y:b.y,width:b.width,height:b.height},r:{x:r.x,y:r.y,width:r.width,height:r.height},textCenter:t.y+t.height/2};});
 assert.ok(Math.abs(geometry.b.y+geometry.b.height/2-(geometry.r.y+geometry.r.height/2))<2,JSON.stringify(geometry));
 assert.ok(Math.abs(geometry.textCenter-(geometry.b.y+geometry.b.height/2))<2,JSON.stringify(geometry));
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('UI bug regressions passed: likes/pass confirmation, errors, duplicate guard, cancellation, bottom back, country search, unread badge alignment');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

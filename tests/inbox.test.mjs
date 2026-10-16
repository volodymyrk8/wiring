import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source=(await readFile(new URL('../src/app/inbox.ts',import.meta.url),'utf8')).replace('import { syncWebPushIfGranted } from "@/lib/web-push";', 'const syncWebPushIfGranted = () => {};');
const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
const {createInboxController}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('chrome counts conversations, retains message totals and refreshes a conversation for additional messages',async()=>{
 globalThis.document={title:'WIRING'};
 const state={view:'matches',chatId:null,user:{id:1,unread:0},likesIn:0,unread:0,matches:[]};
 const slot={dataset:{count:'unread'},innerHTML:''};let renders=0,matchRequests=0;
 const controller=createInboxController({state,root:{querySelectorAll:()=>[slot]},pageTitle:'WIRING',pip:n=>String(n),
 api:async(path)=>{if(path==='/api/matches') {matchRequests++;return {matches:[{id:2,unread:5}]};}return {};},
 toast:()=>{},pingBrowser:()=>{},loadLikes:async()=>{},openChat:async()=>{},refreshMe:async()=>{},render:()=>renders++});
 await controller.applyInbox({unread:4,unread_chats:2});
 assert.equal(slot.innerHTML,'2');assert.equal(document.title,'(2) WIRING');
 assert.equal(state.user.unread,4);assert.equal(state.user.unread_chats,2);
 const before=matchRequests;
 await controller.applyInbox({unread:5,unread_chats:2});
 assert.equal(matchRequests,before+1);assert.equal(state.matches[0].unread,5);assert.equal(slot.innerHTML,'2');
 await controller.applyInbox({unread:0,unread_chats:0});
 assert.equal(slot.innerHTML,'0');assert.equal(document.title,'WIRING');
 await controller.applyInbox({unread:3}); // Compatibility while an older server is still running.
 assert.equal(slot.innerHTML,'3');assert.ok(renders>=2);
});

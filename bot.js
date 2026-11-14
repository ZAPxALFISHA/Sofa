// Ashraf Sofas – Telegram admin bot (all buttons are keyboard buttons). Needs Node 20.6+
const admin=require("firebase-admin");
admin.initializeApp({credential:admin.credential.cert(require("./serviceAccountKey.json"))});
const db=admin.firestore(),T=process.env.BOT_TOKEN,ADMINS=(process.env.ADMIN_IDS||"").split(",").map(s=>s.trim()).filter(Boolean);
const call=async(m,b)=>(await fetch(`https://api.telegram.org/bot${T}/${m}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)})).json();
const say=(id,text,kb)=>call("sendMessage",{chat_id:id,text,...(kb?{reply_markup:{keyboard:kb.map(r=>r.map(t=>({text:t}))),resize_keyboard:true,is_persistent:true}}:{})});
const MENU="🏠 Menu",SKIP="⏭ Skip",DY=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MAIN=[["📦 Products","➕ Add Product"],["💰 Change Price","📊 Update Stock"],["🖼 Change Photo","👁 Show/Hide"],["🗑 Delete Product","⭐ Reviews"],["⚙️ Settings"]];
const RMENU=[["➕ Add Review","📋 List Reviews"],["👁 Hide/Show Review","🗑 Delete Review"],[MENU]];
const SMENU=[["📞 Phone","📸 Instagram"],["📍 Address","🕒 Open Hours"],["📅 Weekly Off"],[MENU]];
const S=new Map(),setg=db.doc("site/settings");
const prods=async()=>(await db.collection("products").get()).docs.map(d=>d.data()).sort((a,b)=>(a.order||0)-(b.order||0));
const revs=async()=>(await db.collection("reviews").get()).docs.map(d=>d.data());
const menu=(id,t="Choose an option 👇")=>say(id,t,MAIN);
const cancel=[[MENU]];
async function photo(msg){const ph=msg.photo;if(!ph)return null;const ok=ph.filter(p=>(p.file_size||0)<=600000).pop()||ph[0],f=await call("getFile",{file_id:ok.file_id});
const b=Buffer.from(await(await fetch(`https://api.telegram.org/file/bot${T}/${f.result.file_path}`)).arrayBuffer());return b.length>700000?"BIG":"data:image/jpeg;base64,"+b.toString("base64")}
async function pickP(id,act){const P=await prods();if(!P.length)return say(id,"No products yet.",MAIN);S.set(id,{st:"pick",act,list:P.map(p=>p.id)});return say(id,"Choose product:",[...P.map((p,i)=>[`${i+1}. ${p.name}`.slice(0,60)]),[MENU]])}
async function pickR(id,act){const R=await revs();if(!R.length)return say(id,"No reviews yet.",RMENU);S.set(id,{st:"rpick",act,list:R.map(r=>r.id)});return say(id,"Choose review:",[...R.map((r,i)=>[`${i+1}. ${r.n}: ${r.t}`.slice(0,60)]),[MENU]])}
async function route(id,tx){
 if(!(await setg.get()).exists)return say(id,"⚠️ First open admin.html, login and tap Save & Publish once. Then use this bot.",MAIN);
 const go=(st,q,kb)=>{S.set(id,{st,d:{}});return say(id,q,kb||cancel)};
 switch(tx){
 case"📦 Products":{const P=await prods();return say(id,P.map((p,i)=>`${i+1}. ${p.name}\n   ${p.price} · Stock: ${p.stock}${p.show===false?" · 🙈 hidden":""}`).join("\n")||"No products.",MAIN)}
 case"💰 Change Price":return pickP(id,"price");case"📊 Update Stock":return pickP(id,"stock");case"🖼 Change Photo":return pickP(id,"photo");case"👁 Show/Hide":return pickP(id,"vis");case"🗑 Delete Product":return pickP(id,"del");
 case"➕ Add Product":return go("aName","Product name?");
 case"⭐ Reviews":return say(id,"Reviews",RMENU);
 case"➕ Add Review":return go("rName","Customer name?");
 case"📋 List Reviews":{const R=await revs();return say(id,R.map((r,i)=>`${i+1}. ${"★".repeat(r.r)} ${r.n}${r.show===false?" 🙈":""}\n   ${r.t}`).join("\n")||"No reviews.",RMENU)}
 case"👁 Hide/Show Review":return pickR(id,"rvis");case"🗑 Delete Review":return pickR(id,"rdel");
 case"⚙️ Settings":return say(id,"Settings",SMENU);
 case"📞 Phone":return go("s:phone","New 10-digit WhatsApp/call number?");
 case"📸 Instagram":return go("s:ig","Instagram username (without @)?");
 case"📍 Address":return go("s:addr","New address?");
 case"🕒 Open Hours":return go("s:hours","Send hours in India time as open-close (24h), e.g. 10-20");
 case"📅 Weekly Off":return go("s:off","Which day is off?",[DY.slice(0,4),DY.slice(4),["None"],[MENU]]);
 default:return menu(id)}}
async function step(id,s,tx,msg){const done=(t,kb)=>{S.delete(id);return say(id,t,kb||MAIN)},ask=(t,kb)=>say(id,t,kb||cancel);
 const pr=id=>db.doc("products/"+id);
 if(s.st=="pick"){const pid=s.list[parseInt(tx)-1];if(!pid)return ask("Please tap a product from the keyboard.");
  if(s.act=="vis"){const p=(await pr(pid).get()).data(),v=p.show===false;await pr(pid).update({show:v});return done(`${p.name} is now ${v?"👁 visible":"🙈 hidden"} on the website.`)}
  S.set(id,{st:"val",act:s.act,pid});
  return s.act=="del"?(S.set(id,{st:"cdel",pid}),ask("Delete this product permanently?",[["✅ Yes, delete","❌ Cancel"]])):ask(s.act=="price"?"Send new price text (e.g. From ₹85,000 or Get Price)":s.act=="stock"?"Send new stock quantity (number)":"Send the new photo")}
 if(s.st=="val"){if(s.act=="price"){await pr(s.pid).update({price:tx});return done("✅ Price updated: "+tx)}
  if(s.act=="stock"){const n=parseInt(tx);if(isNaN(n))return ask("Please send a number.");await pr(s.pid).update({stock:n});return done("✅ Stock updated: "+n)}
  const img=await photo(msg);if(!img)return ask("Please send a photo.");if(img=="BIG")return ask("Photo too big, send a smaller one.");await pr(s.pid).update({img});return done("✅ Photo updated.")}
 if(s.st=="cdel"){if(tx.startsWith("✅")){await pr(s.pid).delete();return done("🗑 Product deleted.")}return done("Cancelled.")}
 if(s.st=="rpick"){const rid=s.list[parseInt(tx)-1];if(!rid)return ask("Please tap a review from the keyboard.");const rf=db.doc("reviews/"+rid);
  if(s.act=="rdel"){await rf.delete();return done("🗑 Review deleted.",RMENU)}const r=(await rf.get()).data(),v=r.show===false;await rf.update({show:v});return done(`Review is now ${v?"👁 visible":"🙈 hidden"}.`,RMENU)}
 const d=s.d;
 switch(s.st){
 case"aName":d.name=tx;s.st="aCat";return ask("Category? Tap one or type a new one.",[...(await prods()).map(p=>p.cat).filter((c,i,a)=>a.indexOf(c)==i).map(c=>[c]),[MENU]]);
 case"aCat":d.cat=tx;s.st="aPrice";return ask("Price text? (e.g. From ₹65,000 or Get Price)");
 case"aPrice":d.price=tx;s.st="aStock";return ask("Stock quantity? (number)");
 case"aStock":{const n=parseInt(tx);if(isNaN(n))return ask("Please send a number.");d.stock=n;s.st="aDesc";return ask("Short description?")}
 case"aDesc":d.desc=tx;s.st="aPhoto";return ask("Send a photo of the product, or tap Skip.",[[SKIP],[MENU]]);
 case"aPhoto":{let img="";if(tx!=SKIP){img=await photo(msg);if(!img)return ask("Send a photo or tap Skip.",[[SKIP],[MENU]]);if(img=="BIG")return ask("Photo too big, send a smaller one.",[[SKIP],[MENU]])}
  const n=Date.now();await pr("p"+n).set({id:"p"+n,name:d.name,cat:d.cat,desc:d.desc,price:d.price,stock:d.stock,img,show:true,order:n,ill:["#1d5a49","#123C32",{w:300}]});return done("✅ Product added: "+d.name)}
 case"rName":d.n=tx;s.st="rStars";return ask("Stars?",[["5","4","3"],["2","1"],[MENU]]);
 case"rStars":{const n=parseInt(tx);if(!(n>=1&&n<=5))return ask("Tap 1 to 5.");d.r=n;s.st="rText";return ask("Review text?")}
 case"rText":{const n=Date.now();await db.doc("reviews/r"+n).set({id:"r"+n,n:d.n,r:d.r,t:tx,show:true});return done("✅ Review added.",RMENU)}
 case"s:phone":{const p=tx.replace(/\D/g,"").slice(-10);if(p.length<10)return ask("Send a 10-digit number.");await setg.update({phone:p});return done("✅ Number updated: "+p,SMENU)}
 case"s:ig":await setg.update({ig:tx.replace("@","").trim()});return done("✅ Instagram updated.",SMENU);
 case"s:addr":await setg.update({addr:tx});return done("✅ Address updated.",SMENU);
 case"s:hours":{const m=tx.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);if(!m||+m[1]>23||+m[2]>24)return ask("Format: 10-20");await setg.update({open:+m[1],close:+m[2]});return done(`✅ Hours updated: ${m[1]}:00 – ${m[2]}:00 IST`,SMENU)}
 case"s:off":{const i=tx=="None"?7:DY.indexOf(tx);if(i<0)return ask("Tap a day from the keyboard.");await setg.update({off:i});return done("✅ Weekly off updated: "+tx,SMENU)}
 default:return done("Back to menu.")}}
async function handle(msg){const id=msg.chat.id,uid=String(msg.from.id),tx=(msg.text||"").trim();
 if(!ADMINS.includes(uid))return say(id,"⛔ Not authorized. Your Telegram ID is "+uid);
 try{if(tx=="/start"||tx=="/menu"||tx==MENU){S.delete(id);return menu(id)}
  const s=S.get(id);return s?await step(id,s,tx,msg):await route(id,tx)}
 catch(e){console.error(e);S.delete(id);return say(id,"⚠️ Something went wrong: "+(e.message||e),MAIN)}}
module.exports={handle};
if(require.main===module){if(!T||!ADMINS.length){console.error("Set BOT_TOKEN and ADMIN_IDS in .env");process.exit(1)}
 let off=0;console.log("Bot running…");
 (async()=>{for(;;){try{const r=await call("getUpdates",{offset:off,timeout:30,allowed_updates:["message"]});for(const u of r.result||[]){off=u.update_id+1;if(u.message)await handle(u.message)}}catch(e){console.error(e);await new Promise(r=>setTimeout(r,3000))}}})()}

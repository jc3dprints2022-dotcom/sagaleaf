import { chromium } from 'playwright';
const URL='https://saga.proxima-3d.com/saga-reader.html';
const VP={ phone:{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:false,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'}, tablet:{viewport:{width:834,height:1194},deviceScaleFactor:2,userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'} };
const b = await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
await Promise.all(Object.entries(VP).map(async ([name,opt]) => {
  const ctx = await b.newContext({...opt, colorScheme:'light', locale:'en-US', timezoneId:'America/Phoenix'}); const p = await ctx.newPage();
  const shot = async (tag)=>{ await p.waitForTimeout(400); await p.screenshot({path:`public/app/real/${name}-${tag}.png`}); console.log(name, tag); };
  const vis = async (re)=> (await p.getByRole('button',{name:re}).count())>0;
  await p.goto(URL,{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
  await p.getByRole('button',{name:'Add classic books'}).click(); await p.waitForTimeout(7000);
  await p.goto(URL+'#/library'); await p.waitForTimeout(2000);
  if (await vis(/Keep both/)) { await p.getByRole('button',{name:/Keep both/}).click(); await p.waitForTimeout(800); }
  await p.getByText(/Pride and Prejudice/i).first().click(); await p.waitForTimeout(2500);
  await shot('book-details');
  await p.getByRole('link',{name:'Start reading'}).click(); await p.waitForTimeout(6000);
  await shot('reader');
  // select the opening sentence inside the book iframe
  const fr = p.frames().find(f=>f.url().startsWith('blob:'));
  const r = await fr.evaluate(()=>{ const el=[...document.querySelectorAll('p')].find(e=>/truth universally/.test(e.textContent)); const q=el.getBoundingClientRect(); return {x:q.left,y:q.top,w:q.width,h:q.height}; });
  const fb = await (await fr.frameElement()).boundingBox();
  const sx=fb.x+r.x+2, sy=fb.y+r.y+8, ex=fb.x+r.x+r.w*0.8, ey=fb.y+r.y+r.h-8;
  await p.mouse.move(sx,sy); await p.mouse.down(); await p.mouse.move(ex,ey,{steps:12}); await p.mouse.up(); await p.waitForTimeout(1200);
  await shot('reader-select');
  await p.getByRole('button',{name:'Highlight Amber'}).click(); await p.waitForTimeout(800);
  // note on the next paragraph
  const r2 = await fr.evaluate(()=>{ const el=[...document.querySelectorAll('p')].find(e=>/However little known/.test(e.textContent)); const q=el.getBoundingClientRect(); return {x:q.left,y:q.top,w:q.width,h:q.height}; });
  await p.mouse.move(fb.x+r2.x+1,fb.y+r2.y+8); await p.mouse.down(); await p.mouse.move(fb.x+r2.x+r2.w*0.7,fb.y+r2.y+40,{steps:12}); await p.mouse.up(); await p.waitForTimeout(1000);
  if (await vis(/^Note$/)) { await p.getByRole('button',{name:/^Note$/}).click(); await p.waitForTimeout(800);
    const ta = p.locator('textarea:visible'); if (await ta.count()) { await ta.first().fill('The famous opening line, and it is already ironic.'); await shot('reader-note-edit');
      const btns = await p.evaluate(()=>[...document.querySelectorAll('button')].filter(e=>e.offsetParent).map(e=>e.innerText.trim()||e.getAttribute('aria-label'))); console.log('note buttons', btns.join(' | '));
      for (const n of [/^Save/i,/^Done/i,/^Add note/i]) if (await vis(n)) { await p.getByRole('button',{name:n}).first().click(); break; } await p.waitForTimeout(800); } }
  await p.mouse.click(5,5).catch(()=>{}); await p.waitForTimeout(500);
  await shot('reader-highlighted');
  await p.getByRole('button',{name:/Text and layout/}).click(); await p.waitForTimeout(1200); await shot('typography');
  await p.getByRole('button',{name:'Close panel'}).first().click().catch(()=>{}); await p.waitForTimeout(600);
  await p.getByRole('button',{name:/Highlights and notes/}).click(); await p.waitForTimeout(1200); await shot('highlights-notes');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.goto(URL+'#/catalog'); await p.waitForTimeout(65000); await shot('discover-top');
  await p.getByText('New from Standard Ebooks').first().evaluate(e=>{e.scrollIntoView(); window.scrollBy(0,-12); document.querySelectorAll('*').forEach(x=>{});}); await p.waitForTimeout(2500); await shot('discover');
  await p.goto(URL+'#/'); await p.waitForTimeout(4000); await shot('home');
  await p.goto(URL+'#/library'); await p.waitForTimeout(2500); await shot('library');
  await p.goto(URL+'#/settings'); await p.waitForTimeout(2500); await shot('settings');
  await ctx.close();
}));
await b.close();

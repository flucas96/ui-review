import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  createRandom,
  planPointerMotion,
  planTyping,
} from "../../.agents/skills/create-product-demo-video/scripts/human-motion.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [annotationImage, codeImage, resultImage] = await Promise.all([
  imageData(join(repositoryRoot, "docs/images/html-review-comments.jpg")),
  imageData(join(repositoryRoot, "docs/images/react-review-desktop.jpg")),
  imageData(join(repositoryRoot, "docs/images/react-review-mobile.jpg")),
]);

const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({
  colorScheme: "dark",
  deviceScaleFactor: 1,
  recordVideo: {
    dir: join(repositoryRoot, "output/playwright/raw-video"),
    size: { height: 1_350, width: 1_080 },
  },
  viewport: { height: 1_350, width: 1_080 },
});
const page = await context.newPage();
const video = page.video();

try {
  await page.setContent(socialMarkup({ annotationImage, codeImage, resultImage }));
  await animateSocialInteraction(page);
} finally {
  await context.close();
  await browser.close();
}

process.stdout.write(`${await video.path()}\n`);

function browserLaunchOptions() {
  const executablePath = process.env.CHROME_EXECUTABLE;
  return executablePath === undefined
    ? { channel: process.env.DEMO_BROWSER_CHANNEL ?? "chrome", headless: true }
    : { executablePath, headless: true };
}

async function imageData(path) {
  return `data:image/jpeg;base64,${(await readFile(path)).toString("base64")}`;
}

function socialMarkup(images) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>${styles()}</style>
    </head>
    <body>
      <div class="grid"></div>
      <div class="glow glow-one"></div>
      <div class="glow glow-two"></div>
      <div class="flash flash-one"></div>
      <div class="flash flash-two"></div>
      <div class="progress"></div>

      <section class="scene hook">
        <div class="brand"><span>✦</span>UI REVIEW</div>
        <div class="kicker">VISUAL FEEDBACK FOR CODING AGENTS</div>
        <h1><i>POINT.</i><i>TYPE.</i><i>SHIP.</i></h1>
        <p>From “this feels off” to a verified fix.</p>
      </section>

      <section class="scene annotate">
        <div class="scene-label"><b>01</b> PIN THE FEEDBACK</div>
        <h2>Say exactly<br><em>what should change.</em></h2>
        <div class="media-card">
          <img src="${images.annotationImage}" alt="">
          <div class="typed-note"><span data-social-note></span></div>
        </div>
      </section>

      <section class="scene agent">
        <div class="scene-label"><b>02</b> THE AGENT GETS CONTEXT</div>
        <h2>Screenshot + selector.<br><em>Full context.</em></h2>
        <div class="agent-card">
          <img src="${images.codeImage}" alt="">
          <div class="working"><i></i><span><b>Implementing</b><small>#hero-cta · exact DOM context</small></span></div>
          <div class="diff-line first"><b>+</b> high-contrast primary action</div>
          <div class="diff-line second"><b>+</b> intentional hero spacing</div>
        </div>
      </section>

      <section class="scene result">
        <div class="scene-label"><b>03</b> VERIFY IN CONTEXT</div>
        <h2>Review. Resolve.<br><em>Done.</em></h2>
        <div class="media-card result-card"><img src="${images.resultImage}" alt=""></div>
        <div class="resolved-pill"><span>✓</span>Ready for review</div>
      </section>

      <section class="scene finish">
        <div class="finish-mark">✦</div>
        <div class="kicker">ONE LOOP. FULL CONTEXT.</div>
        <h2>Build at the speed<br><em>you can point.</em></h2>
        <div class="url">github.com/flucas96/ui-review <span>↗</span></div>
      </section>

      <div class="cursor">
        <span><svg viewBox="0 0 24 30"><path d="M2.2 1.8v20.1l5.2-4.7 4.1 9.2 4.1-1.9-4.1-8.8h7.2L2.2 1.8Z" fill="#fff" stroke="#20212a" stroke-width="1.7" stroke-linejoin="round"/></svg></span>
      </div>
    </body>
  </html>`;
}

function styles() {
  return `
  :root { color-scheme: dark; font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  * { box-sizing: border-box; }
  body { background: #101016; color: #f7f6fb; height: 1350px; margin: 0; overflow: hidden; position: relative; width: 1080px; }
  .grid { background-image: linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px); background-size: 46px 46px; inset: 0; mask-image: linear-gradient(to bottom,black,transparent 88%); position: absolute; }
  .glow { border-radius: 50%; filter: blur(100px); opacity: .28; position: absolute; }
  .glow-one { animation: drift-one 8s ease-in-out infinite alternate; background: #725cff; height: 620px; right: -280px; top: -250px; width: 620px; }
  .glow-two { animation: drift-two 7s ease-in-out infinite alternate; background: #42d2aa; bottom: -300px; height: 540px; left: -240px; opacity: .14; width: 540px; }
  .scene { inset: 0; opacity: 0; padding: 105px 72px 80px; pointer-events: none; position: absolute; }
  .brand { align-items: center; display: flex; font-size: 19px; font-weight: 800; gap: 13px; letter-spacing: .06em; }
  .brand span,.finish-mark { align-items:center;background:linear-gradient(145deg,#8b7dff,#6552ee);border:1px solid rgba(255,255,255,.3);border-radius:14px;box-shadow:0 17px 45px rgba(92,71,216,.38);display:flex;height:52px;justify-content:center;width:52px}
  .kicker,.scene-label { color: #9b98aa; font-size: 15px; font-weight: 760; letter-spacing: .14em; text-transform: uppercase; }
  .hook { animation: scene-one 11.4s ease both; display: flex; flex-direction: column; justify-content: center; }
  .hook .kicker { margin-top: 135px; }
  h1 { font-size: 108px; letter-spacing: -.075em; line-height: .84; margin: 29px 0 0; }
  h1 i { display: block; font-style: normal; transform-origin: left center; }
  h1 i:nth-child(2) { color: #8f7cff; }
  h1 i:nth-child(3) { background: linear-gradient(105deg,#9d8cff,#7ae0c1); -webkit-background-clip: text; color: transparent; }
  .hook p { color: #aaa8b5; font-size: 27px; line-height: 1.4; margin-top: 38px; max-width: 760px; }
  .scene-label { align-items: center; display: flex; gap: 13px; }
  .scene-label b { align-items: center; background: rgba(126,108,255,.18); border: 1px solid rgba(126,108,255,.35); border-radius: 99px; color: #a99cff; display: flex; font-size: 12px; height: 34px; justify-content: center; letter-spacing: 0; width: 34px; }
  h2 { font-size: 66px; letter-spacing: -.055em; line-height: .98; margin: 30px 0 36px; }
  h2 em { background: linear-gradient(105deg,#9d8cff,#7ae0c1); -webkit-background-clip: text; color: transparent; font-style: normal; }
  .annotate { animation: scene-two 11.4s cubic-bezier(.2,.8,.2,1) both; }
  .media-card,.agent-card { background: #e7e4dc; border: 1px solid rgba(255,255,255,.18); border-radius: 29px; box-shadow: 0 45px 100px rgba(0,0,0,.38); height: 645px; overflow: hidden; position: relative; transform: perspective(1200px) rotateX(2deg) rotateY(-3deg); }
  .media-card img,.agent-card img { height: 100%; object-fit: cover; object-position: center; width: 100%; }
  .typed-note { background: rgba(22,22,29,.94); border: 1px solid rgba(255,255,255,.12); border-radius: 16px; bottom: 34px; box-shadow: 0 18px 55px rgba(0,0,0,.3); color: white; font: 18px ui-monospace,SFMono-Regular,Menlo,monospace; left: 30px; padding: 19px 22px; position: absolute; right: 30px; }
  .typed-note span { display: inline; }
  .typed-note span::after { animation: caret-blink .62s step-end infinite; background: currentColor; content:""; display:inline-block; height:1em; margin-left:3px; vertical-align:-.12em; width:2px; }
  .agent { animation: scene-three 11.4s cubic-bezier(.2,.8,.2,1) both; }
  .agent-card { background: #19191f; height: 640px; transform: perspective(1200px) rotateX(1deg) rotateY(3deg); }
  .agent-card img { filter: brightness(.68) saturate(.9); object-position: center; }
  .working { align-items: center; background: rgba(29,29,37,.95); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; display: flex; gap: 15px; left: 30px; padding: 17px 20px; position: absolute; right: 30px; top: 30px; }
  .working i { animation: spin .7s linear infinite; border: 3px solid #4b4959; border-radius: 50%; border-top-color: #8c7aff; height: 26px; width: 26px; }
  .working b,.working small { display: block; } .working b { font-size: 17px; } .working small { color: #83818e; font-size: 12px; margin-top: 4px; }
  .diff-line { animation: diff-in .5s cubic-bezier(.2,.8,.2,1) both; background: rgba(40,130,99,.92); border: 1px solid rgba(112,232,189,.25); border-radius: 12px; bottom: 95px; font: 16px ui-monospace,SFMono-Regular,Menlo,monospace; left: 38px; padding: 16px 18px; position: absolute; right: 38px; }
  .diff-line b { color: #7bf0c4; margin-right: 12px; } .diff-line.first { animation-delay: 4.75s; } .diff-line.second { animation-delay: 5.15s; bottom: 31px; }
  .result { animation: scene-four 11.4s cubic-bezier(.2,.8,.2,1) both; }
  .result-card { height: 660px; transform: perspective(1200px) rotateX(2deg) rotateY(-2deg); }
  .result-card img { object-position: 68% center; }
  .resolved-pill { align-items: center; animation: pill-pop .55s cubic-bezier(.2,1.3,.2,1) 7.65s both; background: #1f9b6d; border: 1px solid rgba(255,255,255,.23); border-radius: 99px; bottom: 115px; box-shadow: 0 15px 40px rgba(26,132,93,.3); display: flex; font-size: 18px; font-weight: 750; gap: 10px; padding: 14px 20px; position: absolute; right: 86px; }
  .resolved-pill span { align-items: center; background: white; border-radius: 50%; color: #16805a; display: flex; height: 25px; justify-content: center; width: 25px; }
  .finish { animation: scene-five 11.4s ease both; display: flex; flex-direction: column; justify-content: center; text-align: center; }
  .finish-mark { font-size: 25px; margin: 0 auto 33px; }
  .finish h2 { font-size: 76px; margin: 28px 0 44px; }
  .url { align-items: center; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; color: #d0ced8; display: flex; font: 18px ui-monospace,SFMono-Regular,Menlo,monospace; justify-content: space-between; margin: 0 auto; padding: 19px 22px; width: 660px; }
  .url span { color: #9d8cff; font-size: 24px; }
  .cursor { filter: drop-shadow(0 4px 6px rgba(0,0,0,.35)); height: 40px; left: 0; opacity:0; pointer-events:none; position:absolute; top:0; transform:translate(900px,1200px); width:32px; z-index:20; }
  .cursor > span { display:block; transform-origin:2px 2px; transition:transform 90ms ease-out; }
  .cursor.is-pressed > span { transform:scale(.91) rotate(-1deg); }
  .cursor::after { border:3px solid rgba(139,125,255,.8); border-radius:50%; content:""; height:20px; left:-6px; opacity:0; position:absolute; top:-6px; transform:scale(.3); width:20px; }
  .cursor.is-clicking::after { animation:social-click .43s ease-out; }
  .cursor svg { height: 40px; width: 32px; }
  .flash { background: white; inset: 0; opacity: 0; pointer-events: none; position: absolute; z-index: 30; }
  .flash-one { animation: flash-one 11.4s ease both; } .flash-two { animation: flash-two 11.4s ease both; }
  .progress { animation: progress 11.4s linear both; background: linear-gradient(90deg,#7868ff,#6cddba); height: 5px; left: 0; position: absolute; top: 0; transform-origin: left; width: 100%; z-index: 40; }
  @keyframes scene-one { 0%{opacity:1;transform:scale(.97)} 16%{opacity:1;transform:scale(1.025)} 20%{opacity:0;transform:scale(1.06)} 100%{opacity:0} }
  @keyframes scene-two { 0%,13%{opacity:0;transform:translateY(30px) scale(.95)} 17%{opacity:1;transform:translateY(0) scale(1)} 34%{opacity:1;transform:scale(1.025)} 38%{opacity:0;transform:scale(1.08)} 100%{opacity:0} }
  @keyframes scene-three { 0%,34%{opacity:0;transform:translateX(45px) scale(.96)} 39%{opacity:1;transform:translateX(0) scale(1)} 56%{opacity:1;transform:scale(1.02)} 60%{opacity:0;transform:translateX(-45px) scale(1.05)} 100%{opacity:0} }
  @keyframes scene-four { 0%,56%{opacity:0;transform:translateY(35px) scale(.95)} 61%{opacity:1;transform:translateY(0) scale(1)} 77%{opacity:1;transform:scale(1.025)} 81%{opacity:0;transform:scale(1.07)} 100%{opacity:0} }
  @keyframes scene-five { 0%,78%{opacity:0;transform:scale(.94)} 83%{opacity:1;transform:scale(1)} 100%{opacity:1;transform:scale(1.025)} }
  @keyframes diff-in { from{opacity:0;transform:translateX(-30px)} to{opacity:1;transform:none} }
  @keyframes pill-pop { from{opacity:0;transform:scale(.5) translateY(15px)} to{opacity:1;transform:none} } @keyframes spin { to{transform:rotate(360deg)} }
  @keyframes caret-blink { 0%,48%{opacity:1} 49%,100%{opacity:0} }
  @keyframes social-click { from{opacity:.95;transform:scale(.3)} to{opacity:0;transform:scale(2.7)} }
  @keyframes flash-one { 37%{opacity:0} 38%{opacity:.2} 39%{opacity:0} } @keyframes flash-two { 59%{opacity:0} 60%{opacity:.18} 61%{opacity:0} }
  @keyframes progress { from{transform:scaleX(0)} to{transform:scaleX(1)} }
  @keyframes drift-one { to{transform:translate(-100px,120px) scale(1.15)} } @keyframes drift-two { to{transform:translate(130px,-80px) scale(1.12)} }
`;
}

async function animateSocialInteraction(page) {
  let cursor = { x: 900, y: 1_200 };
  let seed = 2_026_072_3;
  await page.waitForTimeout(1_600);
  cursor = await moveCursor(page, cursor, page.locator(".typed-note"), seed++);
  await clickCursor(page);
  const typing = planTyping("Make the primary action impossible to miss.", { pace: 2.2, seed: seed++ });
  for (const { character, delayMs } of typing) {
    await page.locator("[data-social-note]").evaluate((element, nextCharacter) => {
      element.textContent = `${element.textContent ?? ""}${nextCharacter}`;
    }, character);
    await page.waitForTimeout(delayMs);
  }
  await page.locator(".cursor").evaluate((element) => {
    element.style.opacity = "0";
  });
  await page.waitForTimeout(2_100);
  await page.locator(".cursor").evaluate((element) => {
    element.style.opacity = "1";
  });
  cursor = await moveCursor(page, cursor, page.locator(".resolved-pill"), seed++);
  await clickCursor(page);
  await page.locator(".cursor").evaluate((element) => {
    element.style.opacity = "0";
  });
  await page.waitForTimeout(3_100);
}

async function moveCursor(page, start, locator, seed) {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("Cannot move the social cursor to an invisible target");
  }
  const random = createRandom(seed);
  const end = {
    x: box.x + box.width * (0.42 + random() * 0.16),
    y: box.y + box.height * (0.42 + random() * 0.16),
  };
  const motion = planPointerMotion({
    end,
    seed,
    start,
    targetHeight: box.height,
    targetWidth: box.width,
  });
  await page.locator(".cursor").evaluate(async (element, planned) => {
    element.style.opacity = "1";
    const animation = element.animate(
      planned.keyframes.map(({ offset, x, y }) => ({
        offset,
        transform: `translate(${String(x)}px, ${String(y)}px)`,
      })),
      { duration: planned.durationMs, easing: "cubic-bezier(.18,.64,.22,1)", fill: "forwards" },
    );
    await animation.finished;
    element.style.transform = `translate(${String(planned.end.x)}px, ${String(planned.end.y)}px)`;
  }, { ...motion, end });
  return end;
}

async function clickCursor(page) {
  await page.locator(".cursor").evaluate((element) => {
    element.classList.remove("is-clicking");
    element.classList.add("is-pressed");
    void element.getBoundingClientRect();
    element.classList.add("is-clicking");
  });
  await page.waitForTimeout(95);
  await page.locator(".cursor").evaluate((element) => {
    element.classList.remove("is-pressed");
  });
  await page.waitForTimeout(260);
}

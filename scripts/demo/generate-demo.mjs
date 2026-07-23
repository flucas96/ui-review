import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { Client } from "../../node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../../node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import {
  createRandom,
  planCameraMotion,
  planPointerMotion,
  planTyping,
} from "../../.agents/skills/create-product-demo-video/scripts/human-motion.mjs";
import { startReviewServer } from "../../packages/ui-review/dist/cli.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fullWorkflow = process.env.DEMO_MODE === "full";
const workDirectory = await mkdtemp(join(tmpdir(), "ui-review-demo-"));
const appPath = join(workDirectory, "index.html");
const rawVideoDirectory = join(repositoryRoot, "output/playwright/raw-video");
await mkdir(rawVideoDirectory, { recursive: true });
await writeFile(appPath, appMarkup(false));

const reviewServer = await startReviewServer({
  appId: "demo-studio",
  host: "127.0.0.1",
  includeHash: false,
  port: 0,
  projectRoot: workDirectory,
  target: appPath,
});

const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({
  colorScheme: "light",
  deviceScaleFactor: 1,
  recordVideo: {
    dir: rawVideoDirectory,
    size: { height: 1_080, width: 1_920 },
  },
  viewport: { height: 1_080, width: 1_920 },
});
const page = await context.newPage();
const video = page.video();
let mcpClient;
let cursorPosition = { x: 1_420, y: 820 };
let motionSeed = 2_026_072_3;

try {
  if (fullWorkflow) {
    await showFullTitle(page);
    await showStartConversation(page, reviewServer.url);
  } else {
    await showTitle(page);
    await showLaunch(page, reviewServer.url);
  }

  await fadeOutPage(page);
  await page.goto(reviewServer.url, { waitUntil: "domcontentloaded" });
  await fadeInPage(page);
  await ensureCursor(page);
  await zoomApp(page, 0.97, 1, "50% 50%", 1_300);
  await page.waitForTimeout(fullWorkflow ? 1_000 : 600);
  await addCaption(
    page,
    fullWorkflow ? "Browser · UI Review" : "1 · Pin feedback",
    fullWorkflow ? "The agent opened the app behind the local review proxy." : "Select the exact element. Context is attached automatically.",
  );
  await page.waitForTimeout(fullWorkflow ? 1_500 : 700);

  await humanClick(page, page.getByLabel("Toggle UI Review"));
  await page.waitForTimeout(fullWorkflow ? 900 : 650);
  await humanClick(page, page.getByLabel("Select element"));
  await page.waitForTimeout(fullWorkflow ? 900 : 650);
  await zoomApp(page, 1, 1.045, "22% 65%", 1_100);
  await humanMoveTo(page, page.locator("#hero-cta"));
  await page.waitForTimeout(fullWorkflow ? 1_200 : 850);
  await humanClick(page, page.locator("#hero-cta"), false);
  await page.waitForTimeout(fullWorkflow ? 600 : 350);
  await typeIntoField(
    page,
    page.getByLabel("Feedback comment"),
    "Make this primary action feel more confident, and give the hero more breathing room.",
    fullWorkflow ? 1.18 : 1.42,
  );
  await page.waitForTimeout(fullWorkflow ? 1_500 : 900);
  await humanClick(page, page.getByRole("button", { name: "Add comment" }));
  await page.waitForTimeout(fullWorkflow ? 2_000 : 1_300);
  await removeCaption(page);

  if (fullWorkflow) {
    await showReviewConversation(page);
  }

  const transport = new StdioClientTransport({
    args: [
      join(repositoryRoot, "packages/ui-review/dist/cli.js"),
      "mcp",
      "--root",
      workDirectory,
    ],
    command: process.execPath,
    cwd: repositoryRoot,
    env: {
      ...process.env,
      UI_REVIEW_AGENT_ID: "demo-agent",
    },
    stderr: "pipe",
  });
  mcpClient = new Client({ name: "ui-review-demo", version: "1.0.0" });
  await mcpClient.connect(transport);
  const listResult = await mcpClient.callTool({
    arguments: { appId: "demo-studio", status: "open" },
    name: "ui_review_list_annotations",
  });
  const annotations = parseToolResult(listResult).annotations;
  const annotationId = annotations[0]?.id;
  if (typeof annotationId !== "string") {
    throw new Error("The recorded annotation could not be found through MCP");
  }

  await showAgent(page, [
    { label: "Discover", text: "1 open visual annotation", tone: "done" },
    { label: "Claim", text: "Lock the thread for this agent", tone: "active" },
    { label: "Implement", text: "Update the selected CTA and hero spacing", tone: "idle" },
    { label: "Verify", text: "Return the result for human review", tone: "idle" },
  ]);
  await mcpClient.callTool({
    arguments: { annotationId, leaseMinutes: 30 },
    name: "ui_review_claim_annotation",
  });
  await mcpClient.callTool({
    arguments: { annotationId, status: "in_progress" },
    name: "ui_review_set_status",
  });
  await page.waitForTimeout(900);
  await updateAgent(page, 1, "done");
  await updateAgent(page, 2, "active");
  await page.waitForTimeout(fullWorkflow ? 1_500 : 900);

  if (fullWorkflow) {
    await showCodeChange(page);
  }
  await writeFile(appPath, appMarkup(true));
  if (fullWorkflow) {
    await showAgent(page, [
      { label: "Discover", text: "1 open visual annotation", tone: "done" },
      { label: "Claim", text: "Locked to this agent session", tone: "done" },
      { label: "Implement", text: "CTA and hero spacing updated", tone: "done" },
      { label: "Verify", text: "Check the rendered result and reply", tone: "active" },
    ]);
  }
  await updateAgent(page, 2, "done");
  await updateAgent(page, 3, "active");
  await page.waitForTimeout(fullWorkflow ? 1_500 : 800);

  await mcpClient.callTool({
    arguments: {
      annotationId,
      message: "Updated the hero spacing and promoted the selected action to a high-contrast primary CTA. Verified at 1920 × 1080.",
    },
    name: "ui_review_reply",
  });
  await mcpClient.callTool({
    arguments: { annotationId, status: "review" },
    name: "ui_review_set_status",
  });
  await mcpClient.callTool({
    arguments: { annotationId },
    name: "ui_review_release_annotation",
  });
  await updateAgent(page, 3, "done");
  await page.waitForTimeout(fullWorkflow ? 1_700 : 900);

  await fadeOutPage(page);
  await page.goto(reviewServer.url, { waitUntil: "domcontentloaded" });
  await fadeInPage(page);
  await ensureCursor(page);
  await zoomApp(page, 0.97, 1, "50% 50%", 1_300);
  await page.waitForTimeout(fullWorkflow ? 900 : 500);
  await addCaption(
    page,
    fullWorkflow ? "Browser · Back to UI Review" : "3 · Review the result",
    fullWorkflow ? "The implementation and agent reply arrive in the same visual thread." : "The change is live. The original app stays clean.",
  );
  await page.waitForTimeout(fullWorkflow ? 1_800 : 1_100);
  await humanClick(page, page.getByLabel("Toggle UI Review"));
  await page.waitForTimeout(fullWorkflow ? 700 : 400);
  await humanClick(page, page.getByRole("button", { name: "Review comments" }));
  await page.waitForTimeout(fullWorkflow ? 1_100 : 700);
  await humanClick(page, page.locator(".ur-card-open"));
  await page.waitForTimeout(fullWorkflow ? 2_000 : 1_200);
  await replaceCaption(
    page,
    fullWorkflow ? "Human verification" : "4 · Approve with confidence",
    fullWorkflow ? "Read the reply, inspect the live result, then resolve with one click." : "Read the agent reply, continue the thread, or resolve.",
  );
  await page.waitForTimeout(fullWorkflow ? 2_300 : 1_300);
  await zoomApp(page, 1, 1.025, "78% 60%", 900);
  await humanClick(page, page.locator(".ur-resolve-button"));
  await page.waitForTimeout(fullWorkflow ? 2_000 : 1_300);
  await removeCaption(page);

  await showFinish(page);
  await page.waitForTimeout(500);
} finally {
  await mcpClient?.close();
  await context.close();
  await browser.close();
  await reviewServer.close();
  await rm(workDirectory, { force: true, recursive: true });
}

const videoPath = await video.path();
process.stdout.write(`${videoPath}\n`);

function browserLaunchOptions() {
  const executablePath = process.env.CHROME_EXECUTABLE;
  return executablePath === undefined
    ? { channel: process.env.DEMO_BROWSER_CHANNEL ?? "chrome", headless: true }
    : { executablePath, headless: true };
}

function parseToolResult(result) {
  const textContent = result.content?.find((item) => item.type === "text");
  if (textContent === undefined || typeof textContent.text !== "string") {
    throw new Error("MCP tool returned no JSON text");
  }
  return JSON.parse(textContent.text);
}

async function showFullTitle(page) {
  await setChapter(page, `
    <div class="eyebrow"><span class="eyebrow-dot"></span>UI REVIEW · FULL WORKFLOW</div>
    <h1>One request.<br><span>One visual feedback loop.</span></h1>
    <p class="lead">Watch a human start the review in Claude Code, annotate the live page, hand the note back to the coding agent, and approve the result.</p>
    <div class="flow">
      <div><b>01</b><span>Ask</span></div><i></i>
      <div><b>02</b><span>Annotate</span></div><i></i>
      <div><b>03</b><span>Build</span></div><i></i>
      <div><b>04</b><span>Approve</span></div>
    </div>
  `);
  await page.waitForTimeout(4_200);
}

async function showStartConversation(page, url) {
  const port = new URL(url).port;
  await setChapter(page, `
    <div class="conversation-shell">
      <header>
        <span class="lights"><i></i><i></i><i></i></span>
        <b>Claude Code · product-site</b>
        <small>SSH: linux-dev</small>
      </header>
      <main>
        <div class="conversation-label"><span>✦</span>Start the visual review</div>
        <div class="conversation-thread">
          <div class="human-message" data-human-message><small>YOU</small><p>/start-ui-review</p></div>
          <div class="thinking" data-thinking><span></span>Claude is inspecting the project…</div>
          <div class="agent-message" data-agent-message>
            <div class="agent-avatar">✦</div>
            <div><small>CLAUDE</small><p>I found a static HTML page. I’ll start it behind UI Review on an available local port.</p>
              <div class="tool-call"><i>✓</i><span><b>UI Review is ready</b><small>http://127.0.0.1:${port}</small></span></div>
            </div>
          </div>
        </div>
        <div class="composer"><span>›</span><code data-typing></code><i>ENTER</i></div>
      </main>
    </div>
    <p class="scene-note">The human only asks. Claude detects the app and launches the review workflow.</p>
  `);
  await humanMoveTo(page, page.locator(".composer"), 1_100);
  await humanClick(page, page.locator(".composer"), false);
  await typeText(page, "[data-typing]", "/start-ui-review", 1.05);
  await page.waitForTimeout(500);
  await page.locator("[data-human-message]").evaluate((element) => element.classList.add("visible"));
  await page.locator("[data-typing]").evaluate((element) => {
    element.textContent = "";
  });
  await page.waitForTimeout(800);
  await page.locator("[data-thinking]").evaluate((element) => element.classList.add("visible"));
  await page.waitForTimeout(1_600);
  await page.locator("[data-thinking]").evaluate((element) => element.classList.remove("visible"));
  await page.locator("[data-agent-message]").evaluate((element) => element.classList.add("visible"));
  await page.waitForTimeout(4_000);
}

async function showReviewConversation(page) {
  await setChapter(page, `
    <div class="conversation-shell">
      <header>
        <span class="lights"><i></i><i></i><i></i></span>
        <b>Claude Code · product-site</b>
        <small>UI Review connected</small>
      </header>
      <main>
        <div class="conversation-label"><span>✦</span>Feedback is waiting</div>
        <div class="conversation-thread">
          <div class="human-message" data-human-message><small>YOU</small><p>/review-feedback</p></div>
          <div class="thinking" data-thinking><span></span>Claude is loading the annotation thread…</div>
          <div class="agent-message" data-agent-message>
            <div class="agent-avatar">✦</div>
            <div><small>CLAUDE</small><p>I’ll read the full annotation, claim it, implement the requested change, verify it, and reply in the thread.</p>
              <div class="tool-call"><i>→</i><span><b>Reading visual context</b><small>#hero-cta · 1 open annotation</small></span></div>
            </div>
          </div>
        </div>
        <div class="composer"><span>›</span><code data-typing></code><i>ENTER</i></div>
      </main>
    </div>
    <p class="scene-note">Back in Claude Code, one command hands the visual note to the coding agent.</p>
  `);
  await humanMoveTo(page, page.locator(".composer"), 1_100);
  await humanClick(page, page.locator(".composer"), false);
  await typeText(page, "[data-typing]", "/review-feedback", 1.05);
  await page.waitForTimeout(500);
  await page.locator("[data-human-message]").evaluate((element) => element.classList.add("visible"));
  await page.locator("[data-typing]").evaluate((element) => {
    element.textContent = "";
  });
  await page.waitForTimeout(800);
  await page.locator("[data-thinking]").evaluate((element) => element.classList.add("visible"));
  await page.waitForTimeout(1_600);
  await page.locator("[data-thinking]").evaluate((element) => element.classList.remove("visible"));
  await page.locator("[data-agent-message]").evaluate((element) => element.classList.add("visible"));
  await page.waitForTimeout(3_400);
}

async function showCodeChange(page) {
  await setChapter(page, `
    <div class="code-shell">
      <header>
        <span class="lights"><i></i><i></i><i></i></span>
        <b>index.html</b>
        <small>Claude Code · editing</small>
      </header>
      <div class="code-layout">
        <aside><strong>EXPLORER</strong><span>⌄ product-site</span><b>◇ index.html</b><span>◇ README.md</span></aside>
        <main>
          <div class="code-tab">index.html <i>●</i></div>
          <pre><span class="line"><i>46</i>  .hero {</span>
<span class="line removed"><i>47</i>-   padding: 57px 60px;</span>
<span class="line added"><i>47</i>+   padding: 73px 72px;</span>
<span class="line"><i>48</i>  }</span>
<span class="line"><i>49</i></span>
<span class="line"><i>50</i>  #hero-cta {</span>
<span class="line removed"><i>51</i>-   background: transparent;</span>
<span class="line added"><i>51</i>+   background: #272831;</span>
<span class="line added"><i>52</i>+   color: #ffffff;</span>
<span class="line added"><i>53</i>+   box-shadow: 0 12px 28px rgba(28,29,36,.18);</span>
<span class="line"><i>54</i>  }</span></pre>
        </main>
        <section class="coding-note">
          <span>✦</span>
          <div><small>CLAUDE</small><b>Implementing the requested emphasis</b><p>Promoting the selected action and adding intentional hero spacing.</p></div>
        </section>
      </div>
    </div>
    <p class="scene-note">The agent edits the real source—not a screenshot or detached mock-up.</p>
  `);
  await humanMoveTo(page, page.locator(".code-tab"), 1_000);
  const changedLines = page.locator(".line.removed, .line.added");
  for (let index = 0; index < await changedLines.count(); index += 1) {
    await changedLines.nth(index).evaluate((element) => element.classList.add("visible"));
    await page.waitForTimeout(420);
  }
  await humanMoveTo(page, page.locator(".coding-note"), 1_050);
  await page.waitForTimeout(2_000);
}

async function typeText(page, selector, value, pace = 1) {
  const timeline = planTyping(value, { pace, seed: motionSeed++ });
  for (const { character, delayMs } of timeline) {
    await page.locator(selector).evaluate((element, nextCharacter) => {
      element.textContent = `${element.textContent ?? ""}${nextCharacter}`;
    }, character);
    await page.waitForTimeout(delayMs);
  }
}

async function typeIntoField(page, locator, value, pace = 1) {
  await locator.focus();
  const timeline = planTyping(value, { pace, seed: motionSeed++ });
  for (const { character, delayMs } of timeline) {
    await locator.pressSequentially(character);
    await page.waitForTimeout(delayMs);
  }
}

async function showTitle(page) {
  await setChapter(page, `
    <div class="eyebrow"><span class="eyebrow-dot"></span>UI REVIEW · REAL WORKFLOW</div>
    <h1>From visual feedback<br><span>to a verified change.</span></h1>
    <p class="lead">Pin feedback directly to any HTML or React app. Your coding agent gets the context and returns a verified result.</p>
    <div class="flow">
      <div><b>01</b><span>Annotate</span></div><i></i>
      <div><b>02</b><span>Implement</span></div><i></i>
      <div><b>03</b><span>Review</span></div>
    </div>
  `);
  await page.waitForTimeout(3_200);
}

async function showLaunch(page, url) {
  const port = new URL(url).port;
  await setChapter(page, `
    <div class="terminal-shell">
      <header><span class="lights"><i></i><i></i><i></i></span><b>claude · product-site</b><small>zsh</small></header>
      <main>
        <div class="prompt"><span>›</span><strong data-launch-command></strong></div>
        <div class="terminal-space"></div>
        <div class="terminal-thinking" data-launch-thinking><i></i><span>Detecting the app and starting the review proxy…</span></div>
        <div class="launch-result" data-launch-result>
          <div class="result-line"><i>✓</i><div><b>UI Review is ready</b><span>The app and feedback layer are running together.</span></div></div>
          <div class="terminal-url"><span>Review URL</span><b>http://127.0.0.1:${port}</b></div>
          <div class="terminal-hint">Open it in VS Code's integrated browser. No extension required.</div>
        </div>
      </main>
    </div>
    <p class="scene-note">A dedicated review URL keeps the original application untouched.</p>
  `);
  await humanMoveTo(page, page.locator(".prompt"), 1_000);
  await humanClick(page, page.locator(".prompt"), false);
  await typeText(page, "[data-launch-command]", "/start-ui-review", 1.12);
  await page.waitForTimeout(500);
  await page.locator("[data-launch-thinking]").evaluate((element) => element.classList.add("visible"));
  await page.waitForTimeout(1_500);
  await page.locator("[data-launch-thinking]").evaluate((element) => element.classList.remove("visible"));
  await page.locator("[data-launch-result]").evaluate((element) => element.classList.add("visible"));
  await page.waitForTimeout(2_200);
}

async function showAgent(page, rows) {
  await setChapter(page, `
    <div class="agent-shell">
      <header>
        <div class="agent-mark">✦</div>
        <div><b>Claude is working</b><span>/review-feedback</span></div>
        <small>UI Review MCP</small>
      </header>
      <main>
        <p class="agent-intro">The agent received a compact annotation with the exact selector and requested outcome.</p>
        <div class="agent-steps">
          ${rows.map((row, index) => `
            <div class="agent-row ${row.tone}" data-agent-step="${index}">
              <span class="status-icon"></span>
              <div><b>${row.label}</b><small>${row.text}</small></div>
              <em>${row.tone === "done" ? "Done" : row.tone === "active" ? "Working" : "Queued"}</em>
            </div>
          `).join("")}
        </div>
        <div class="agent-safety"><span>⌁</span><p><b>Claimed safely</b><small>Parallel agents cannot edit this annotation at the same time.</small></p></div>
      </main>
    </div>
  `);
  await page.waitForTimeout(1_300);
}

async function updateAgent(page, index, tone) {
  await page.locator(`[data-agent-step="${index}"]`).evaluate((element, nextTone) => {
    element.className = `agent-row ${nextTone}`;
    const label = element.querySelector("em");
    if (label !== null) {
      label.textContent = nextTone === "done" ? "Done" : nextTone === "active" ? "Working" : "Queued";
    }
  }, tone);
}

async function showFinish(page) {
  await setChapter(page, `
    <div class="finish-mark">✦</div>
    <div class="eyebrow centered">ONE LOOP. FULL CONTEXT.</div>
    <h2 class="centered-title">Review interfaces<br><span>at the speed you build them.</span></h2>
    <div class="command-strip">
      <code>/start-ui-review</code><i>→</i>
      <code>/review-feedback</code><i>→</i>
      <code>/stop-ui-review</code>
    </div>
    <p class="repo-link">github.com/flucas96/ui-review</p>
  `);
  await page.waitForTimeout(3_800);
}

async function animateChapter(page) {
  await page.waitForTimeout(150);
  await page.locator("body").evaluate((body) => body.classList.add("ready"));
}

async function setChapter(page, content) {
  if (await page.locator("body").count() > 0) {
    await fadeOutPage(page);
  }
  await page.setContent(chapterMarkup(content));
  await page.locator("body").evaluate((body) => {
    body.style.opacity = "0";
    body.style.transition = "opacity 360ms ease";
  });
  await page.waitForTimeout(80);
  await page.locator("body").evaluate((body) => {
    body.style.opacity = "1";
  });
  await animateChapter(page);
  await ensureCursor(page);
}

async function fadeOutPage(page) {
  await page.locator("body").evaluate((body) => {
    body.style.opacity = "1";
    body.style.transition = "opacity 320ms ease";
    requestAnimationFrame(() => {
      body.style.opacity = "0";
    });
  });
  await page.waitForTimeout(340);
}

async function fadeInPage(page) {
  await page.locator("body").evaluate((body) => {
    body.style.opacity = "0";
    body.style.transition = "opacity 360ms ease";
    requestAnimationFrame(() => {
      body.style.opacity = "1";
    });
  });
  await page.waitForTimeout(380);
}

async function ensureCursor(page) {
  await page.evaluate(({ x, y }) => {
    const reviewHost = document.querySelector("[data-ui-review-root]");
    const targetRoot = reviewHost?.shadowRoot ?? document.body;
    if (targetRoot.querySelector(".demo-human-cursor") !== null) {
      return;
    }
    const style = document.createElement("style");
    style.dataset.demoCursorStyle = "";
    style.textContent = `
      .demo-human-cursor {
        filter: drop-shadow(0 3px 5px rgba(12,12,18,.28)); height: 30px; left: 0; pointer-events: none;
        position: fixed; top: 0; transform: translate(${x}px, ${y}px); width: 24px; z-index: 2147483647;
      }
      .demo-human-cursor-shape { display: block; transform-origin: 2px 2px; transition: transform 90ms ease-out; }
      .demo-human-cursor svg { display: block; height: 30px; width: 24px; }
      .demo-human-cursor::after {
        border: 2px solid rgba(120,104,255,.72); border-radius: 50%; content: ""; height: 12px; left: -4px;
        opacity: 0; position: absolute; top: -4px; transform: scale(.3); width: 12px;
      }
      .demo-human-cursor.is-clicking::after { animation: demo-click 430ms ease-out; }
      .demo-human-cursor.is-pressed .demo-human-cursor-shape { transform: scale(.91) rotate(-1deg); }
      @keyframes demo-click { 0% { opacity:.9; transform:scale(.35) } 100% { opacity:0; transform:scale(2.4) } }
    `;
    const cursor = document.createElement("div");
    cursor.className = "demo-human-cursor";
    cursor.innerHTML = '<span class="demo-human-cursor-shape"><svg viewBox="0 0 24 30" aria-hidden="true"><path d="M2.2 1.8v20.1l5.2-4.7 4.1 9.2 4.1-1.9-4.1-8.8h7.2L2.2 1.8Z" fill="#fff" stroke="#20212a" stroke-width="1.7" stroke-linejoin="round"/></svg></span>';
    targetRoot.append(style, cursor);
  }, cursorPosition);
}

async function humanMoveTo(page, locator, preferredDuration) {
  await ensureCursor(page);
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("Cannot animate the cursor to an invisible element");
  }
  const seed = motionSeed++;
  const random = createRandom(seed);
  const target = {
    x: box.x + Math.min(box.width * (0.42 + random() * 0.16), box.width - 8),
    y: box.y + Math.min(box.height * (0.42 + random() * 0.16), box.height - 8),
  };
  const motion = planPointerMotion({
    end: target,
    seed,
    start: cursorPosition,
    targetHeight: box.height,
    targetWidth: box.width,
  });
  const duration = preferredDuration === undefined
    ? motion.durationMs
    : Math.round((motion.durationMs + preferredDuration) / 2);
  await page.locator(".demo-human-cursor").evaluate(
    async (cursor, movement) => {
      const animation = cursor.animate(
        movement.keyframes.map(({ offset, x, y }) => ({
          offset,
          transform: `translate(${String(x)}px, ${String(y)}px)`,
        })),
        { duration: movement.duration, easing: "cubic-bezier(.18,.64,.22,1)", fill: "forwards" },
      );
      await animation.finished;
      cursor.style.transform = `translate(${movement.target.x}px, ${movement.target.y}px)`;
    },
    { duration, keyframes: motion.keyframes, target },
  );
  cursorPosition = target;
  return motion;
}

async function humanClick(page, locator, move = true) {
  const timing = move
    ? await humanMoveTo(page, locator)
    : planPointerMotion({ end: cursorPosition, seed: motionSeed++, start: cursorPosition });
  await page.waitForTimeout(timing.preClickPauseMs);
  await page.locator(".demo-human-cursor").evaluate((cursor) => {
    cursor.classList.remove("is-clicking");
    cursor.classList.add("is-pressed");
    void cursor.getBoundingClientRect();
    cursor.classList.add("is-clicking");
  });
  await page.waitForTimeout(95);
  await locator.click();
  await page.locator(".demo-human-cursor").evaluate((cursor) => {
    cursor.classList.remove("is-pressed");
  });
  await page.waitForTimeout(timing.postClickPauseMs);
}

async function zoomApp(page, from, to, origin, duration) {
  const [originX, originY] = origin.split(/\s+/u);
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error("A viewport is required for camera animation");
  }
  const focus = {
    x: parseCameraOrigin(originX ?? "50%", viewport.width),
    y: parseCameraOrigin(originY ?? "50%", viewport.height),
  };
  const current = await page.evaluate(({ focus: focusPoint, startScale }) => {
    let camera = document.querySelector("[data-demo-camera]");
    if (!(camera instanceof HTMLElement)) {
      camera = document.createElement("div");
      camera.dataset.demoCamera = "";
      camera.style.minHeight = "100vh";
      camera.style.transformOrigin = "0 0";
      camera.style.width = "100%";
      const appElements = [...document.body.children].filter(
        (element) => element instanceof HTMLElement && !element.hasAttribute("data-ui-review-root"),
      );
      document.body.insertBefore(camera, appElements[0] ?? null);
      camera.append(...appElements);
      const x = focusPoint.x * (1 - startScale);
      const y = focusPoint.y * (1 - startScale);
      camera.dataset.cameraX = String(x);
      camera.dataset.cameraY = String(y);
      camera.dataset.cameraScale = String(startScale);
      camera.style.transform = `translate(${String(x)}px, ${String(y)}px) scale(${String(startScale)})`;
    }
    return {
      scale: Number(camera.dataset.cameraScale ?? startScale),
      x: Number(camera.dataset.cameraX ?? 0),
      y: Number(camera.dataset.cameraY ?? 0),
    };
  }, { focus, startScale: from });
  const contentFocus = {
    x: (focus.x - current.x) / current.scale,
    y: (focus.y - current.y) / current.scale,
  };
  const destination = {
    scale: to,
    x: focus.x - contentFocus.x * to,
    y: focus.y - contentFocus.y * to,
  };
  const motion = planCameraMotion({ durationMs: duration, from: current, to: destination });
  await page.locator("[data-demo-camera]").evaluate(
    async (camera, cameraMotion) => {
      const animation = camera.animate(
        cameraMotion.keyframes.map(({ offset, scale, x, y }) => ({
          offset,
          transform: `translate(${String(x)}px, ${String(y)}px) scale(${String(scale)})`,
        })),
        { duration: cameraMotion.durationMs, easing: cameraMotion.easing, fill: "forwards" },
      );
      await animation.finished;
      const finalFrame = cameraMotion.keyframes.at(-1);
      if (finalFrame === undefined) {
        return;
      }
      camera.style.transform = `translate(${String(finalFrame.x)}px, ${String(finalFrame.y)}px) scale(${String(finalFrame.scale)})`;
      animation.cancel();
      camera.dataset.cameraX = String(finalFrame.x);
      camera.dataset.cameraY = String(finalFrame.y);
      camera.dataset.cameraScale = String(finalFrame.scale);
    },
    motion,
  );
  await page.waitForTimeout(520);
}

function parseCameraOrigin(value, dimension) {
  if (value.endsWith("%")) {
    return dimension * Number.parseFloat(value) / 100;
  }
  return Number.parseFloat(value);
}

async function addCaption(page, title, subtitle) {
  await page.locator("[data-ui-review-root]").evaluate((host, content) => {
    const root = host.shadowRoot;
    if (root === null) {
      return;
    }
    const style = document.createElement("style");
    style.dataset.demoCaptionStyle = "";
    style.textContent = `
      .demo-caption {
        align-items: center; background: rgba(20, 21, 27, .93); border: 1px solid rgba(255,255,255,.12);
        border-radius: 14px; box-shadow: 0 18px 55px rgba(7,7,12,.24); color: white; display: flex;
        gap: 16px; left: 24px; max-width: 610px; opacity: 0; padding: 13px 17px; pointer-events: none;
        position: fixed; top: 22px; transform: translateY(-8px); transition: opacity .35s ease, transform .35s ease;
        z-index: 80;
      }
      .demo-caption.is-visible { opacity: 1; transform: translateY(0); }
      .demo-caption::before { background: #7868ff; border-radius: 99px; content: ""; height: 34px; width: 4px; }
      .demo-caption b { display: block; font-size: 13px; letter-spacing: -.01em; margin-bottom: 3px; }
      .demo-caption span { color: #b9bbc6; display: block; font-size: 11px; line-height: 1.4; }
    `;
    const caption = document.createElement("div");
    caption.className = "demo-caption";
    caption.innerHTML = `<div><b>${content.title}</b><span>${content.subtitle}</span></div>`;
    root.append(style, caption);
    requestAnimationFrame(() => caption.classList.add("is-visible"));
  }, { subtitle, title });
}

async function replaceCaption(page, title, subtitle) {
  await page.locator("[data-ui-review-root]").evaluate((host, content) => {
    const caption = host.shadowRoot?.querySelector(".demo-caption");
    if (caption !== null && caption !== undefined) {
      caption.innerHTML = `<div><b>${content.title}</b><span>${content.subtitle}</span></div>`;
    }
  }, { subtitle, title });
}

async function removeCaption(page) {
  await page.locator("[data-ui-review-root]").evaluate((host) => {
    host.shadowRoot?.querySelector(".demo-caption")?.remove();
    host.shadowRoot?.querySelector("[data-demo-caption-style]")?.remove();
  });
}

function chapterMarkup(content) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>${chapterStyles()}</style>
    </head>
    <body><div class="grain"></div><div class="orb one"></div><div class="orb two"></div><article class="chapter">${content}</article></body>
  </html>`;
}

function chapterStyles() {
  return `
  :root { color-scheme: dark; font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  * { box-sizing: border-box; }
  body { background: #111117; color: #f6f5fb; height: 100vh; margin: 0; overflow: hidden; }
  body::before { background: linear-gradient(rgba(255,255,255,.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.022) 1px, transparent 1px); background-size: 48px 48px; content:""; inset:0; mask-image: linear-gradient(to bottom, black, transparent 85%); position:fixed; }
  .grain { background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.12'/%3E%3C/svg%3E"); inset:0; opacity:.2; pointer-events:none; position:fixed; }
  .orb { border-radius: 50%; filter: blur(70px); opacity: .2; position: fixed; }
  .orb.one { background:#725cff; height:430px; right:-80px; top:-190px; width:430px; }
  .orb.two { background:#4fd1a8; bottom:-250px; height:420px; left:-150px; opacity:.09; width:420px; }
  .chapter { left:50%; max-width:1360px; opacity:0; position:absolute; top:50%; transform:translate(-50%, calc(-50% + 18px)) scale(.975); transition:opacity .7s ease, transform 1.1s cubic-bezier(.2,.8,.2,1); width:calc(100% - 180px); }
  body.ready .chapter { opacity:1; transform:translate(-50%, -50%); }
  .eyebrow { align-items:center; color:#aaa6c0; display:flex; font-size:12px; font-weight:700; gap:9px; letter-spacing:.15em; margin-bottom:22px; }
  .eyebrow-dot { background:#806cff; border-radius:50%; box-shadow:0 0 0 6px rgba(128,108,255,.12); height:7px; width:7px; }
  h1 { font-size:78px; letter-spacing:-.055em; line-height:1.02; margin:0; max-width:1040px; }
  h1 span, h2 span { background:linear-gradient(105deg,#9d8cff,#c4bbff 48%,#7ae0c1); -webkit-background-clip:text; color:transparent; }
  h2 { font-size:48px; letter-spacing:-.045em; line-height:1.06; margin:0; }
  .lead { color:#aaa9b5; font-size:18px; line-height:1.55; margin:25px 0 0; max-width:720px; }
  .lead.compact { font-size:16px; max-width:470px; }
  .flow { align-items:center; display:flex; gap:20px; margin-top:45px; }
  .flow div { align-items:center; background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.09); border-radius:12px; display:flex; gap:10px; padding:12px 16px; }
  .flow b { color:#8c7aff; font-size:11px; } .flow span { font-size:13px; font-weight:650; } .flow i { background:#44434f; height:1px; width:34px; }
  .split { align-items:center; display:grid; gap:70px; grid-template-columns:1fr 1fr; }
  .plan-card { background:rgba(28,28,36,.8); border:1px solid rgba(255,255,255,.09); border-radius:21px; box-shadow:0 30px 90px rgba(0,0,0,.28); padding:12px; }
  .plan-row { align-items:center; border-bottom:1px solid rgba(255,255,255,.07); display:grid; gap:15px; grid-template-columns:34px 1fr auto; padding:17px 15px; }
  .plan-row:last-child { border:0; } .plan-row>b { color:#7768db; font-size:11px; } .plan-row strong { display:block; font-size:14px; } .plan-row span { color:#888793; display:block; font-size:12px; margin-top:4px; } .plan-row em { background:rgba(126,108,255,.11); border:1px solid rgba(126,108,255,.22); border-radius:99px; color:#a99cff; font-size:10px; font-style:normal; padding:5px 8px; }
  .terminal-shell, .agent-shell { background:#1b1b22; border:1px solid rgba(255,255,255,.1); border-radius:18px; box-shadow:0 35px 100px rgba(0,0,0,.4); margin:auto; max-width:980px; overflow:hidden; }
  .terminal-shell header { align-items:center; background:#24242c; border-bottom:1px solid rgba(255,255,255,.07); display:flex; height:47px; justify-content:space-between; padding:0 17px; }
  .terminal-shell header b { color:#aaa9b4; font-size:11px; font-weight:550; } .terminal-shell header small { color:#656571; font-size:10px; }
  .lights { display:flex; gap:7px; width:85px; } .lights i { background:#4b4b54; border-radius:50%; height:9px; width:9px; } .lights i:first-child{background:#ff665d}.lights i:nth-child(2){background:#e8b83f}.lights i:last-child{background:#38bd66}
  .terminal-shell main { min-height:340px; padding:35px 42px; }
  .prompt { align-items:center; display:flex; font:14px ui-monospace,SFMono-Regular,Menlo,monospace; gap:13px; } .prompt span{color:#7768ff}.prompt strong{color:#f0eff5}
  .terminal-space { height:38px; } .result-line { align-items:flex-start; display:flex; gap:13px; } .result-line>i { align-items:center; background:#1f4d3d; border-radius:50%; color:#6bdfb7; display:flex; font-size:11px; font-style:normal; height:22px; justify-content:center; width:22px; } .result-line b{display:block;font-size:14px}.result-line span{color:#777681;display:block;font-size:12px;margin-top:6px}
  .terminal-thinking{align-items:center;color:#84828e;display:flex;font-size:11px;gap:10px;opacity:0;transition:opacity .3s ease}.terminal-thinking.visible{opacity:1}.terminal-thinking i,.thinking span{animation:spin .8s linear infinite;border:2px solid #4b4959;border-radius:50%;border-top-color:#8c7aff;height:15px;width:15px}.launch-result{opacity:0;transform:translateY(8px);transition:opacity .45s ease,transform .45s ease}.launch-result.visible{opacity:1;transform:translateY(0)}
  .terminal-url { align-items:center; background:#15151a; border:1px solid rgba(255,255,255,.07); border-radius:10px; display:flex; gap:23px; margin-top:25px; padding:15px 17px; } .terminal-url span{color:#686773;font:11px ui-monospace,monospace}.terminal-url b{color:#9d8cff;font:12px ui-monospace,monospace;font-weight:550}
  .terminal-hint { color:#696873; font-size:11px; margin:18px 3px 0; } .scene-note { color:#777681; font-size:11px; margin:20px auto 0; max-width:860px; text-align:center; }
  .agent-shell { max-width:790px; } .agent-shell header { align-items:center; background:#24242c; border-bottom:1px solid rgba(255,255,255,.07); display:grid; gap:12px; grid-template-columns:38px 1fr auto; padding:15px 20px; } .agent-mark { align-items:center;background:linear-gradient(145deg,#8b7dff,#6552ee);border-radius:10px;display:flex;height:36px;justify-content:center;width:36px}.agent-shell header b{display:block;font-size:13px}.agent-shell header span{color:#777681;display:block;font:10px ui-monospace,monospace;margin-top:3px}.agent-shell header>small{background:#303039;border-radius:99px;color:#9f9eaa;font-size:9px;padding:6px 9px}
  .agent-shell main { padding:25px 27px 27px; } .agent-intro { color:#aaa9b4;font-size:12px;line-height:1.5;margin:0 0 18px}.agent-steps{border:1px solid rgba(255,255,255,.07);border-radius:13px;overflow:hidden}.agent-row{align-items:center;background:#1f1f27;border-bottom:1px solid rgba(255,255,255,.06);display:grid;gap:13px;grid-template-columns:22px 1fr auto;padding:13px 15px;transition:background .35s ease}.agent-row:last-child{border:0}.agent-row.active{background:rgba(119,104,255,.1)}.status-icon{border:2px solid #4f4e59;border-radius:50%;height:16px;width:16px}.agent-row.done .status-icon{background:#55c9a3;border-color:#55c9a3;position:relative}.agent-row.done .status-icon::after{border:solid #132f26;border-width:0 1.5px 1.5px 0;content:"";height:6px;left:5px;position:absolute;top:3px;transform:rotate(45deg);width:3px}.agent-row.active .status-icon{animation:spin .8s linear infinite;border-color:#8c7aff;border-top-color:transparent}.agent-row b{display:block;font-size:12px}.agent-row small{color:#74737f;display:block;font-size:10px;margin-top:3px}.agent-row em{color:#63626d;font-size:9px;font-style:normal}.agent-row.done em{color:#5dcba7}.agent-row.active em{color:#9d8cff}.agent-safety{align-items:center;background:rgba(79,204,165,.07);border:1px solid rgba(79,204,165,.13);border-radius:11px;display:flex;gap:12px;margin-top:16px;padding:12px 15px}.agent-safety>span{color:#5dcba7;font-size:20px}.agent-safety p{margin:0}.agent-safety b{display:block;font-size:10px}.agent-safety small{color:#71717b;display:block;font-size:9px;margin-top:3px}
  .conversation-shell,.code-shell{background:#1b1b22;border:1px solid rgba(255,255,255,.1);border-radius:18px;box-shadow:0 35px 100px rgba(0,0,0,.4);margin:auto;max-width:930px;overflow:hidden}.conversation-shell>header,.code-shell>header{align-items:center;background:#24242c;border-bottom:1px solid rgba(255,255,255,.07);display:grid;grid-template-columns:100px 1fr auto;height:48px;padding:0 17px}.conversation-shell>header b,.code-shell>header b{color:#aaa9b4;font-size:11px;font-weight:550;text-align:center}.conversation-shell>header small,.code-shell>header small{color:#656571;font-size:10px}.conversation-shell main{min-height:410px;padding:26px 32px 25px}.conversation-label{align-items:center;color:#8d8b98;display:flex;font-size:10px;font-weight:700;gap:8px;letter-spacing:.1em;text-transform:uppercase}.conversation-label span{align-items:center;background:#7768ff;border-radius:8px;color:white;display:flex;height:25px;justify-content:center;width:25px}.conversation-thread{display:flex;flex-direction:column;gap:16px;margin-top:24px;min-height:265px}.human-message{align-self:flex-end;background:#7868ff;border-radius:14px 14px 4px 14px;max-width:420px;opacity:0;padding:12px 15px;transform:translateY(8px);transition:.35s ease}.human-message.visible,.agent-message.visible{opacity:1;transform:translateY(0)}.human-message small,.agent-message small{color:rgba(255,255,255,.65);font-size:8px;font-weight:800;letter-spacing:.08em}.human-message p{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;margin:5px 0 0}.thinking{align-items:center;color:#83818c;display:flex;font-size:9px;gap:9px;height:0;opacity:0;overflow:hidden;padding-left:43px;transition:height .3s ease,opacity .3s ease}.thinking.visible{height:22px;opacity:1}.agent-message{align-items:flex-start;display:flex;gap:11px;max-width:680px;opacity:0;transform:translateY(8px);transition:.4s ease}.agent-avatar{align-items:center;background:#302d4c;border:1px solid #4b447b;border-radius:9px;color:#a99cff;display:flex;height:31px;justify-content:center;width:31px}.agent-message>div:last-child{background:#25252e;border:1px solid rgba(255,255,255,.07);border-radius:4px 14px 14px 14px;padding:13px 15px;width:100%}.agent-message p{color:#c3c1ca;font-size:11px;line-height:1.5;margin:6px 0 0}.tool-call{align-items:center;background:#19191f;border:1px solid rgba(255,255,255,.07);border-radius:9px;display:flex;gap:11px;margin-top:12px;padding:10px 12px}.tool-call>i{align-items:center;background:#20493b;border-radius:50%;color:#61d0aa;display:flex;font-size:9px;font-style:normal;height:19px;justify-content:center;width:19px}.tool-call b{display:block;font-size:10px}.tool-call span small{color:#777681;display:block;font:9px ui-monospace,monospace;margin-top:3px}.composer{align-items:center;background:#15151a;border:1px solid rgba(255,255,255,.08);border-radius:11px;display:grid;gap:10px;grid-template-columns:16px 1fr auto;height:49px;padding:0 14px}.composer>span{color:#7868ff}.composer code{color:#f3f1fa;font-size:12px}.composer code::after{animation:blink 1s steps(1) infinite;background:#8c7aff;content:"";display:inline-block;height:14px;margin-left:2px;vertical-align:-2px;width:1px}.composer>i{border:1px solid rgba(255,255,255,.1);border-radius:5px;color:#656571;font-size:7px;font-style:normal;padding:4px 6px}@keyframes blink{50%{opacity:0}}@keyframes spin{to{transform:rotate(360deg)}}
  .code-shell{max-width:1040px}.code-layout{display:grid;grid-template-columns:150px 1fr 270px;min-height:450px}.code-layout>aside{background:#18181e;border-right:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;gap:12px;padding:18px 14px}.code-layout>aside strong{color:#6f6e79;font-size:8px;letter-spacing:.12em}.code-layout>aside span,.code-layout>aside b{color:#85848e;font-size:9px;font-weight:500}.code-layout>aside b{background:#282731;border-radius:5px;color:#c2bfcc;padding:6px}.code-layout>main{background:#1d1d24;overflow:hidden}.code-tab{background:#24242c;border-bottom:1px solid rgba(255,255,255,.06);color:#b4b2bc;font-size:9px;padding:11px 15px}.code-tab i{color:#d6a74c;font-style:normal;margin-left:7px}.code-layout pre{font:11px/1.85 ui-monospace,SFMono-Regular,Menlo,monospace;margin:0;padding:22px 0}.line{color:#b7b3c1;display:block;padding:0 20px}.line i{color:#55545f;display:inline-block;font-style:normal;margin-right:17px;text-align:right;width:20px}.line.removed,.line.added{opacity:0;transform:translateX(-8px);transition:opacity .38s ease,transform .38s ease}.line.removed.visible,.line.added.visible{opacity:1;transform:translateX(0)}.line.removed{background:rgba(221,84,104,.09);color:#e7a5ae}.line.added{background:rgba(76,204,158,.1);color:#9de4c9}.coding-note{align-items:flex-start;background:#202028;border-left:1px solid rgba(255,255,255,.06);display:flex;gap:10px;padding:22px 18px}.coding-note>span{align-items:center;background:#7768ff;border-radius:8px;display:flex;height:28px;justify-content:center;width:28px}.coding-note small{color:#777681;font-size:8px;letter-spacing:.08em}.coding-note b{display:block;font-size:11px;line-height:1.4;margin-top:8px}.coding-note p{color:#797782;font-size:9px;line-height:1.5}
  .finish-mark { align-items:center;background:linear-gradient(145deg,#8b7dff,#6552ee);border:1px solid rgba(255,255,255,.25);border-radius:17px;box-shadow:0 18px 50px rgba(95,73,220,.35);display:flex;font-size:25px;height:58px;justify-content:center;margin:0 auto 25px;width:58px}.centered{justify-content:center;margin-bottom:17px}.centered-title{font-size:52px;text-align:center}.command-strip{align-items:center;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:13px;display:flex;gap:17px;margin:35px auto 0;padding:13px 18px;width:max-content}.command-strip code{color:#c6c2d2;font-size:11px}.command-strip i{color:#55545f;font-style:normal}.repo-link{color:#777681;font-size:11px;letter-spacing:.03em;margin-top:20px;text-align:center}
`;
}

function appMarkup(improved) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Northstar Studio</title>
      <style>
        :root { color:#20212a; font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        * { box-sizing:border-box; }
        body { background:#f4f2ec; margin:0; min-height:100vh; }
        header { align-items:center; display:flex; height:88px; justify-content:space-between; margin:auto; max-width:1450px; padding:0 28px; }
        .logo { align-items:center; display:flex; font-size:14px; font-weight:750; gap:10px; letter-spacing:-.02em; }
        .logo-mark { align-items:center; background:#22232b; border-radius:9px; color:white; display:flex; height:30px; justify-content:center; width:30px; }
        nav { display:flex; gap:29px; } nav a { color:#72716f; font-size:12px; text-decoration:none; }
        .header-action { border:1px solid #d6d2c9; border-radius:99px; color:#292a31; font-size:11px; font-weight:650; padding:9px 14px; text-decoration:none; }
        main { margin:auto; max-width:1450px; padding:28px 28px 48px; }
        .hero { background:#e5e1d7; border:1px solid rgba(31,31,36,.07); border-radius:34px; display:grid; gap:${improved ? "82px" : "48px"}; grid-template-columns:1.05fr .95fr; min-height:650px; overflow:hidden; padding:${improved ? "92px 88px" : "76px 80px"}; position:relative; transition:all .4s ease; }
        .copy { align-self:center; position:relative; z-index:2; }
        .tag { align-items:center; color:#6f6e6a; display:flex; font-size:10px; font-weight:700; gap:8px; letter-spacing:.12em; margin-bottom:22px; text-transform:uppercase; }
        .tag::before { background:#6d5de8; border-radius:50%; content:""; height:6px; width:6px; }
        h1 { color:#24252c; font-size:${improved ? "72px" : "66px"}; letter-spacing:-.055em; line-height:.99; margin:0; max-width:720px; transition:all .4s ease; }
        h1 span { color:#74736e; }
        .copy>p { color:#716f69; font-size:17px; line-height:1.58; margin:27px 0 0; max-width:560px; }
        .actions { align-items:center; display:flex; gap:15px; margin-top:${improved ? "36px" : "27px"}; transition:all .4s ease; }
        #hero-cta { background:${improved ? "#272831" : "transparent"}; border:1px solid ${improved ? "#272831" : "#b6b1a8"}; border-radius:99px; box-shadow:${improved ? "0 12px 28px rgba(28,29,36,.18)" : "none"}; color:${improved ? "#fff" : "#55534f"}; font-size:12px; font-weight:700; padding:${improved ? "14px 21px" : "10px 15px"}; text-decoration:none; transition:all .4s ease; }
        .link { color:#6c6963; font-size:11px; font-weight:650; text-decoration:none; }
        .visual { align-self:center; background:#cec8bb; border-radius:25px; box-shadow:0 30px 70px rgba(47,43,35,.12); height:500px; overflow:hidden; position:relative; transform:rotate(2deg); }
        .visual::before { background:linear-gradient(135deg,#6e5ce9,#9589ff); border-radius:50%; content:""; filter:blur(1px); height:280px; position:absolute; right:-60px; top:-70px; width:280px; }
        .visual::after { background:#292a32; border-radius:50%; bottom:-100px; content:""; height:290px; left:-75px; position:absolute; width:290px; }
        .card { background:rgba(250,249,246,.88); border:1px solid rgba(255,255,255,.55); border-radius:15px; bottom:29px; box-shadow:0 17px 50px rgba(22,22,28,.17); left:30px; padding:17px; position:absolute; right:30px; z-index:2; }
        .card small { color:#86837d; display:block; font-size:9px; letter-spacing:.08em; text-transform:uppercase; }
        .card b { display:block; font-size:16px; margin-top:7px; }
        .metrics { display:flex; gap:6px; margin-top:14px; } .metrics i { background:#dedad2; border-radius:99px; height:7px; width:25%; } .metrics i:first-child{background:#6f5fea;width:62%}
        .trusted { align-items:center; color:#96938b; display:flex; font-size:9px; gap:25px; justify-content:center; letter-spacing:.09em; margin-top:23px; text-transform:uppercase; }
        .trusted b { color:#77746e; font-size:11px; letter-spacing:-.02em; text-transform:none; }
      </style>
    </head>
    <body>
      <header>
        <div class="logo"><span class="logo-mark">N</span>Northstar</div>
        <nav><a href="#">Work</a><a href="#">Services</a><a href="#">Studio</a></nav>
        <a class="header-action" href="#">Start a project</a>
      </header>
      <main>
        <section class="hero">
          <div class="copy">
            <div class="tag">Independent digital studio</div>
            <h1>We shape ideas<br><span>people remember.</span></h1>
            <p>Strategy, identity, and digital products for ambitious teams building the next meaningful thing.</p>
            <div class="actions">
              <a id="hero-cta" href="#">View selected work</a>
              <a class="link" href="#">Meet the studio →</a>
            </div>
          </div>
          <div class="visual"><div class="card"><small>Recent launch</small><b>Solace — a calmer way to work</b><div class="metrics"><i></i><i></i><i></i></div></div></div>
        </section>
        <div class="trusted"><span>Trusted by</span><b>Acme</b><b>Fable</b><b>Arc</b><b>Form</b></div>
      </main>
    </body>
  </html>`;
}

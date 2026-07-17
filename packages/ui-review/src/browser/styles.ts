export const overlayStyles = `
  :host {
    --ur-accent: #7868ff;
    --ur-accent-dark: #6654f4;
    --ur-accent-soft: #eeeaff;
    --ur-bg: rgba(252, 252, 253, 0.96);
    --ur-border: rgba(25, 26, 33, 0.11);
    --ur-danger: #d84b5e;
    --ur-ink: #191a21;
    --ur-muted: #777a87;
    --ur-shadow: 0 24px 72px rgba(20, 20, 28, 0.2), 0 4px 16px rgba(20, 20, 28, 0.08);
    --ur-success: #24966b;
    --ur-warning: #d48a2f;
    color: var(--ur-ink);
    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 14px;
    font-synthesis: none;
    inset: 0;
    pointer-events: none;
    position: fixed;
    text-rendering: optimizeLegibility;
    z-index: 2147483647;
  }

  *, *::before, *::after { box-sizing: border-box; }
  button, textarea, select { font: inherit; }
  button { -webkit-tap-highlight-color: transparent; }
  button:focus-visible, textarea:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid #8b7dff; outline-offset: 2px; }
  [hidden] { display: none !important; }

  .ur-toolbar {
    align-items: center;
    backdrop-filter: blur(24px) saturate(140%);
    background: rgba(24, 24, 31, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 17px;
    bottom: 22px;
    box-shadow: 0 18px 55px rgba(7, 7, 12, 0.32), inset 0 1px rgba(255, 255, 255, 0.08);
    color: white;
    display: flex;
    gap: 5px;
    left: 50%;
    padding: 7px;
    pointer-events: auto;
    position: fixed;
    transform: translateX(-50%);
    transition: transform 180ms ease, opacity 180ms ease, width 180ms ease;
    z-index: 40;
  }

  .ur-toolbar[data-expanded="false"] {
    backdrop-filter: none;
    background: transparent;
    border: 0;
    border-radius: 16px;
    box-shadow: none;
    left: auto;
    padding: 0;
    right: 22px;
    transform: none;
  }

  .ur-brand {
    align-items: center;
    background: linear-gradient(145deg, #8b7dff, #6552ee);
    border: 1px solid rgba(255, 255, 255, 0.34);
    border-radius: 11px;
    box-shadow: inset 0 1px rgba(255, 255, 255, 0.25), 0 4px 12px rgba(105, 84, 238, 0.35);
    color: #fff;
    cursor: pointer;
    display: flex;
    height: 40px;
    justify-content: center;
    padding: 0;
    transition: box-shadow 150ms ease, transform 150ms ease;
    width: 40px;
  }

  .ur-toolbar[data-expanded="false"] .ur-brand {
    border-radius: 15px;
    box-shadow: inset 0 1px rgba(255, 255, 255, 0.32), 0 12px 30px rgba(74, 57, 190, 0.28), 0 3px 8px rgba(20, 20, 28, 0.14);
    height: 48px;
    width: 48px;
  }

  .ur-toolbar[data-expanded="false"] .ur-brand:hover { box-shadow: inset 0 1px rgba(255, 255, 255, 0.36), 0 14px 34px rgba(74, 57, 190, 0.34), 0 4px 10px rgba(20, 20, 28, 0.16); transform: translateY(-1px); }
  .ur-toolbar[data-expanded="false"] .ur-brand:active { transform: translateY(0) scale(0.98); }

  .ur-brand svg { height: 21px; width: 21px; }
  .ur-actions { align-items: center; display: flex; gap: 3px; }
  .ur-toolbar[data-expanded="false"] .ur-actions { display: none; }
  .ur-divider { background: rgba(255, 255, 255, 0.13); height: 26px; margin: 0 3px; width: 1px; }

  .ur-tool-button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 10px;
    color: #b8bac5;
    cursor: pointer;
    display: flex;
    gap: 7px;
    height: 40px;
    padding: 0 11px;
    position: relative;
    transition: background 140ms ease, color 140ms ease;
  }

  .ur-tool-button:hover { background: rgba(255, 255, 255, 0.08); color: white; }
  .ur-tool-button[data-active="true"] { background: rgba(120, 104, 255, 0.23); color: #c9c1ff; }
  .ur-tool-button svg { height: 17px; width: 17px; }
  .ur-tool-label { font-size: 12px; font-weight: 650; letter-spacing: -0.01em; }
  .ur-count {
    align-items: center;
    background: var(--ur-accent);
    border: 2px solid #202027;
    border-radius: 999px;
    color: white;
    display: flex;
    font-size: 9px;
    font-weight: 800;
    height: 18px;
    justify-content: center;
    min-width: 18px;
    padding: 0 4px;
    position: absolute;
    right: 2px;
    top: 0;
  }

  .ur-panel {
    backdrop-filter: blur(24px) saturate(130%);
    background: var(--ur-bg);
    border: 1px solid var(--ur-border);
    border-radius: 20px;
    bottom: 82px;
    box-shadow: var(--ur-shadow);
    display: flex;
    flex-direction: column;
    max-width: calc(100vw - 24px);
    overflow: hidden;
    pointer-events: auto;
    position: fixed;
    right: 18px;
    top: 18px;
    width: 390px;
    z-index: 30;
  }

  .ur-panel-header {
    align-items: center;
    border-bottom: 1px solid var(--ur-border);
    display: grid;
    gap: 10px;
    grid-template-columns: auto 1fr auto;
    min-height: 72px;
    padding: 14px 15px;
  }

  .ur-panel-heading { min-width: 0; }
  .ur-panel-title { font-size: 14px; font-weight: 760; letter-spacing: -0.02em; margin: 0; }
  .ur-panel-subtitle { color: var(--ur-muted); font-size: 11px; margin: 3px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ur-icon-button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 9px;
    color: #858895;
    cursor: pointer;
    display: flex;
    height: 34px;
    justify-content: center;
    padding: 0;
    width: 34px;
  }
  .ur-icon-button:hover { background: #f0f0f4; color: var(--ur-ink); }
  .ur-icon-button svg { height: 17px; width: 17px; }

  .ur-panel-body { flex: 1; min-height: 0; min-width: 0; overflow-x: hidden; overflow-y: auto; padding: 13px; }
  .ur-list { display: grid; gap: 9px; }
  .ur-bulk-bar { align-items: center; background: #f4f3f9; border: 1px solid #e6e4ef; border-radius: 11px; display: flex; flex-wrap: wrap; gap: 7px; justify-content: space-between; margin-bottom: 10px; min-width: 0; padding: 8px 9px; }
  .ur-select-all { align-items: center; color: #686b78; cursor: pointer; display: flex; font-size: 10px; font-weight: 700; gap: 7px; }
  .ur-select-all input, .ur-card-top input { accent-color: var(--ur-accent); height: 16px; margin: 0; width: 16px; }
  .ur-bulk-resolve { background: var(--ur-accent); border: 0; border-radius: 8px; color: white; cursor: pointer; font-size: 10px; font-weight: 750; min-height: 32px; padding: 6px 9px; }
  .ur-bulk-resolve:disabled { cursor: default; opacity: 0.42; }
  .ur-show-resolved { background: transparent; border: 0; color: #686b78; cursor: pointer; flex-basis: 100%; font-size: 10px; font-weight: 700; min-height: 28px; text-align: left; }
  .ur-inline-empty { color: var(--ur-muted); padding: 42px 20px; text-align: center; }
  .ur-inline-empty strong { color: var(--ur-ink); display: block; font-size: 13px; }
  .ur-inline-empty p { font-size: 11px; line-height: 1.5; margin: 7px auto 0; max-width: 230px; }
  .ur-card {
    background: #fff;
    border: 1px solid #e6e6ec;
    border-radius: 14px;
    display: block;
    padding: 14px;
    text-align: left;
    transition: border 140ms ease, box-shadow 140ms ease, transform 140ms ease;
    width: 100%;
  }
  .ur-card:hover { border-color: #cbc7ee; box-shadow: 0 7px 22px rgba(39, 37, 61, 0.07); transform: translateY(-1px); }
  .ur-card-top { align-items: center; display: flex; gap: 8px; min-width: 0; }
  .ur-card-index { align-items: center; background: var(--ur-accent-soft); border-radius: 7px; color: var(--ur-accent-dark); display: flex; font-size: 10px; font-weight: 800; height: 24px; justify-content: center; width: 24px; }
  .ur-target-label { color: #555864; flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ur-status { align-items: center; color: var(--ur-muted); display: inline-flex; font-size: 9px; font-weight: 700; gap: 5px; text-transform: uppercase; }
  .ur-status::before { background: #a2a4ad; border-radius: 50%; content: ""; height: 6px; width: 6px; }
  .ur-status[data-status="open"]::before { background: var(--ur-accent); }
  .ur-status[data-status="in_progress"]::before { background: var(--ur-warning); }
  .ur-status[data-status="review"]::before { background: var(--ur-success); box-shadow: 0 0 0 3px rgba(36, 150, 107, 0.12); }
  .ur-status[data-status="resolved"]::before { background: #a2a4ad; }
  .ur-card-open { background: transparent; border: 0; cursor: pointer; display: block; padding: 0; text-align: left; width: 100%; }
  .ur-card-message { color: #292b33; display: -webkit-box; font-size: 12px; line-height: 1.48; margin: 12px 0 0; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
  .ur-card-meta { color: #9a9ca6; display: flex; font-size: 9px; justify-content: space-between; margin-top: 11px; }
  .ur-card-resolve { background: #eeebff; border: 0; border-radius: 8px; color: #6252d7; cursor: pointer; font-size: 10px; font-weight: 750; margin-top: 11px; min-height: 32px; padding: 6px 10px; width: 100%; }
  .ur-card-resolve.is-resolved { background: #f0f1f4; color: #6f7280; }

  .ur-empty { align-items: center; color: var(--ur-muted); display: flex; flex-direction: column; justify-content: center; min-height: 100%; padding: 42px 24px; text-align: center; }
  .ur-empty-icon { align-items: center; background: var(--ur-accent-soft); border-radius: 16px; color: var(--ur-accent); display: flex; height: 54px; justify-content: center; margin-bottom: 16px; width: 54px; }
  .ur-empty-icon svg { height: 24px; width: 24px; }
  .ur-empty strong { color: var(--ur-ink); font-size: 14px; }
  .ur-empty p { font-size: 11px; line-height: 1.55; margin: 7px 0 0; max-width: 230px; }

  .ur-detail-meta { background: #f3f2fa; border: 1px solid #e8e5f8; border-radius: 12px; margin-bottom: 16px; padding: 12px; }
  .ur-detail-meta code { color: #524d73; display: block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ur-detail-meta span { color: #8a879c; display: block; font-size: 9px; margin-top: 6px; }
  .ur-thread { display: grid; gap: 13px; }
  .ur-message { display: flex; flex-direction: column; max-width: 88%; }
  .ur-message[data-author="user"] { justify-self: end; }
  .ur-message[data-author="agent"] { justify-self: start; }
  .ur-message-label { color: #999ba5; font-size: 9px; font-weight: 700; margin: 0 5px 5px; text-transform: uppercase; }
  .ur-message[data-author="user"] .ur-message-label { text-align: right; }
  .ur-message-bubble { background: #f0f0f4; border-radius: 14px 14px 14px 4px; color: #33353d; font-size: 12px; line-height: 1.5; padding: 10px 12px; white-space: pre-wrap; }
  .ur-message[data-author="user"] .ur-message-bubble { background: var(--ur-accent); border-radius: 14px 14px 4px 14px; color: white; }
  .ur-message-time { color: #afb0b8; font-size: 8px; margin: 4px 5px 0; }
  .ur-message[data-author="user"] .ur-message-time { text-align: right; }

  .ur-panel-footer { border-top: 1px solid var(--ur-border); padding: 12px; }
  .ur-reply-form { align-items: end; background: #f2f2f5; border: 1px solid #e5e5eb; border-radius: 13px; display: flex; gap: 8px; padding: 7px 7px 7px 11px; }
  .ur-reply-form:focus-within { border-color: #bdb6fa; box-shadow: 0 0 0 3px rgba(120, 104, 255, 0.1); }
  .ur-reply-form textarea { background: transparent; border: 0; color: var(--ur-ink); flex: 1; font-size: 11px; line-height: 1.45; max-height: 100px; min-height: 32px; outline: 0; padding: 7px 0; resize: none; }
  .ur-send-button { align-items: center; background: var(--ur-accent); border: 0; border-radius: 9px; color: white; cursor: pointer; display: flex; height: 34px; justify-content: center; width: 34px; }
  .ur-send-button:disabled { cursor: default; opacity: 0.45; }
  .ur-send-button svg { height: 15px; width: 15px; }
  .ur-detail-actions { align-items: center; display: grid; gap: 7px; grid-template-columns: auto 1fr auto; margin-top: 9px; }
  .ur-delete-button { background: transparent; border: 0; color: #858894; cursor: pointer; font-size: 11px; min-height: 40px; padding: 8px; }
  .ur-delete-button:hover { color: var(--ur-danger); }
  .ur-resolve-button { background: var(--ur-accent); border: 0; border-radius: 9px; color: white; cursor: pointer; font-size: 11px; font-weight: 750; min-height: 40px; padding: 8px 12px; }
  .ur-resolve-button.is-resolved { background: #ececf1; color: #676a76; }
  .ur-status-select { background: #f0f0f4; border: 0; border-radius: 9px; color: #626571; cursor: pointer; font-size: 10px; font-weight: 700; min-height: 40px; padding: 8px; text-transform: uppercase; }

  .ur-pin-layer { inset: 0; pointer-events: none; position: fixed; z-index: 6; }
  .ur-pin {
    align-items: center;
    background: var(--ur-accent);
    border: 2px solid white;
    border-radius: 50% 50% 50% 4px;
    box-shadow: 0 5px 16px rgba(43, 35, 112, 0.3);
    color: white;
    cursor: pointer;
    display: flex;
    font-size: 10px;
    font-weight: 800;
    height: 28px;
    justify-content: center;
    pointer-events: auto;
    position: fixed;
    transform: translate(-50%, -100%) rotate(-45deg);
    transition: transform 130ms ease, opacity 130ms ease;
    width: 28px;
  }
  .ur-pin > span { transform: rotate(45deg); }
  .ur-pin:hover { transform: translate(-50%, -100%) rotate(-45deg) scale(1.1); }
  .ur-pin[data-status="in_progress"] { background: var(--ur-warning); }
  .ur-pin[data-status="review"] { background: var(--ur-success); }
  .ur-pin[data-status="resolved"] { background: #8d8f99; opacity: 0.55; }

  .ur-highlight {
    background: rgba(120, 104, 255, 0.1);
    border: 2px solid var(--ur-accent);
    border-radius: 5px;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8), 0 7px 28px rgba(81, 66, 190, 0.16);
    pointer-events: none;
    position: fixed;
    transition: left 55ms linear, top 55ms linear, width 55ms linear, height 55ms linear;
    z-index: 5;
  }
  .ur-highlight-label { background: var(--ur-accent); border-radius: 5px 5px 0 0; bottom: 100%; color: white; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; left: -2px; max-width: 260px; overflow: hidden; padding: 4px 7px; position: absolute; text-overflow: ellipsis; white-space: nowrap; }

  .ur-mode-banner { backdrop-filter: blur(16px); background: rgba(25, 25, 32, 0.92); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 999px; bottom: 82px; box-shadow: 0 10px 30px rgba(10, 10, 14, 0.2); color: white; font-size: 11px; font-weight: 650; left: 50%; padding: 9px 14px; pointer-events: none; position: fixed; transform: translateX(-50%); z-index: 20; }
  .ur-mode-banner span { color: #aaa4e7; font-weight: 500; margin-left: 7px; }

  .ur-region-capture { cursor: crosshair; inset: 0; pointer-events: auto; position: fixed; z-index: 10; }
  .ur-region-draft { background: rgba(120, 104, 255, 0.13); border: 2px solid var(--ur-accent); border-radius: 7px; pointer-events: none; position: fixed; }

  .ur-modal-backdrop { align-items: center; backdrop-filter: blur(7px); background: rgba(20, 20, 27, 0.36); display: flex; inset: 0; justify-content: center; padding: 20px; pointer-events: auto; position: fixed; z-index: 50; }
  .ur-composer { background: #fff; border: 1px solid rgba(24, 25, 31, 0.12); border-radius: 19px; box-shadow: var(--ur-shadow); overflow: hidden; width: min(430px, calc(100vw - 32px)); }
  .ur-composer-head { align-items: center; border-bottom: 1px solid #ececf0; display: flex; gap: 10px; padding: 14px 16px; }
  .ur-composer-icon { align-items: center; background: var(--ur-accent-soft); border-radius: 9px; color: var(--ur-accent); display: flex; height: 32px; justify-content: center; width: 32px; }
  .ur-composer-icon svg { height: 16px; width: 16px; }
  .ur-composer-head div:nth-child(2) { min-width: 0; }
  .ur-composer-head strong { display: block; font-size: 12px; }
  .ur-composer-target { color: #91939d; display: block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ur-composer-body { padding: 14px; }
  .ur-composer textarea { border: 1px solid #ddddE5; border-radius: 12px; color: var(--ur-ink); line-height: 1.55; min-height: 120px; outline: 0; padding: 12px; resize: vertical; width: 100%; }
  .ur-composer textarea:focus { border-color: #aca3f8; box-shadow: 0 0 0 3px rgba(120, 104, 255, 0.1); }
  .ur-composer-hint { color: #a1a2aa; font-size: 9px; margin: 7px 2px 0; }
  .ur-composer-actions { align-items: center; background: #fafafa; border-top: 1px solid #ececf0; display: flex; justify-content: flex-end; gap: 8px; padding: 11px 14px; }
  .ur-button { border: 0; border-radius: 9px; cursor: pointer; font-size: 11px; font-weight: 700; padding: 9px 13px; }
  .ur-button-secondary { background: #eeeef2; color: #666873; }
  .ur-button-primary { background: var(--ur-accent); color: white; }
  .ur-button-primary:disabled { cursor: default; opacity: 0.5; }

  .ur-toast { align-items: center; background: #22232b; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 11px; bottom: 84px; box-shadow: 0 12px 36px rgba(12, 12, 16, 0.25); color: white; display: flex; font-size: 10px; font-weight: 600; gap: 8px; left: 50%; padding: 10px 13px; pointer-events: none; position: fixed; transform: translateX(-50%); z-index: 60; }
  .ur-toast::before { background: #6bd7a9; border-radius: 50%; content: ""; height: 7px; width: 7px; }
  .ur-toast[data-kind="error"]::before { background: #ff7383; }

  @media (max-width: 620px) {
    .ur-toolbar { bottom: 12px; max-width: calc(100vw - 24px); }
    .ur-toolbar[data-panel-open="true"] { display: none; }
    .ur-tool-label { font-size: 10px; }
    .ur-tool-button { gap: 5px; padding: 0 8px; }
    .ur-panel { bottom: 70px; left: 12px; right: 12px; top: 12px; width: auto; }
    .ur-panel-footer { padding: 10px; }
    .ur-card-top { flex-wrap: wrap; }
    .ur-target-label { min-width: 120px; }
    .ur-detail-actions { grid-template-columns: 1fr 1fr; }
    .ur-status-select { grid-column: 1 / -1; width: 100%; }
    .ur-mode-banner { bottom: 72px; }
  }

  @media (max-width: 360px) {
    .ur-tool-label { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .ur-brand, .ur-card, .ur-pin, .ur-toolbar, .ur-highlight { transition: none; }
  }
`;

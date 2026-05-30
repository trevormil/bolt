(()=>{var L={primary:"#2b8fdb",primaryFg:"#ffffff",position:"bottom-right",title:"Send feedback",placeholder:"What's broken, missing, or could be better?",successMessage:"Thanks — we'll take a look."};function P(){let G=document.currentScript;if(G&&G.dataset.project)return G;let q=document.querySelectorAll("script[data-project]");return q[q.length-1]??null}function U(G){let q=G.dataset,J={};if(q.primary)J.primary=q.primary;if(q.primaryFg)J.primaryFg=q.primaryFg;if(q.position==="bottom-right"||q.position==="bottom-left")J.position=q.position;if(q.title)J.title=q.title;if(q.placeholder)J.placeholder=q.placeholder;if(q.success)J.successMessage=q.success;return J}async function k(G,q){try{let J=await fetch(`${G}/v1/projects/${q}/config`,{method:"GET",credentials:"omit"});if(!J.ok)return{};return(await J.json()).theme??{}}catch{return{}}}function S(){return`
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>`}function x(G,q){let J=G.attachShadow({mode:"closed"}),R=document.createElement("style");R.textContent=`
    :host, .root {
      --beacon-primary: ${q.theme.primary};
      --beacon-primary-fg: ${q.theme.primaryFg};
      --beacon-radius: 14px;
      --beacon-panel-bg: #ffffff;
      --beacon-panel-fg: #1a1a1a;
      --beacon-muted: #6b7280;
      --beacon-border: #e5e7eb;
      --beacon-shadow: 0 10px 32px rgba(15, 30, 70, 0.18);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .root {
      position: fixed;
      ${q.theme.position==="bottom-left"?"left: 20px;":"right: 20px;"}
      bottom: 20px;
      z-index: 2147483600;
      color: var(--beacon-panel-fg);
    }
    .bubble {
      width: 56px; height: 56px;
      border-radius: 999px;
      background: var(--beacon-primary);
      color: var(--beacon-primary-fg);
      border: none;
      cursor: pointer;
      box-shadow: var(--beacon-shadow);
      display: flex; align-items: center; justify-content: center;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    .bubble:hover { transform: translateY(-1px); }
    .bubble:active { transform: translateY(0); }
    .panel {
      position: absolute;
      ${q.theme.position==="bottom-left"?"left: 0;":"right: 0;"}
      bottom: 72px;
      width: 340px;
      max-width: calc(100vw - 32px);
      background: var(--beacon-panel-bg);
      border-radius: var(--beacon-radius);
      box-shadow: var(--beacon-shadow);
      border: 1px solid var(--beacon-border);
      padding: 16px;
      display: none;
    }
    .panel.open { display: block; animation: pop 140ms ease; }
    @keyframes pop {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .title {
      font-size: 15px; font-weight: 600; margin: 0 0 10px;
    }
    textarea, input[type="email"] {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--beacon-border);
      border-radius: 8px;
      padding: 9px 10px;
      font: inherit;
      color: inherit;
      background: #fff;
      outline: none;
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    textarea {
      min-height: 96px;
      resize: vertical;
    }
    textarea:focus, input[type="email"]:focus {
      border-color: var(--beacon-primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--beacon-primary) 22%, transparent);
    }
    .row { margin-top: 10px; display: flex; justify-content: flex-end; gap: 8px; align-items: center; }
    .hint { color: var(--beacon-muted); font-size: 12px; margin-right: auto; }
    button.send {
      background: var(--beacon-primary);
      color: var(--beacon-primary-fg);
      border: none;
      padding: 8px 14px;
      border-radius: 8px;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    button.send[disabled] { opacity: 0.6; cursor: progress; }
    .success {
      padding: 28px 8px;
      text-align: center;
      color: var(--beacon-muted);
    }
    .success .check {
      display: inline-flex; align-items: center; justify-content: center;
      width: 40px; height: 40px; border-radius: 999px;
      background: color-mix(in srgb, var(--beacon-primary) 14%, transparent);
      color: var(--beacon-primary);
      margin-bottom: 10px;
    }
    .error {
      color: #b91c1c;
      font-size: 12px;
      margin: 6px 0 0;
    }
  `,J.appendChild(R);let Q=document.createElement("div");Q.className="root",Q.innerHTML=`
    <div class="panel" role="dialog" aria-label="${V(q.theme.title)}">
      <div class="form">
        <p class="title">${V(q.theme.title)}</p>
        <textarea placeholder="${V(q.theme.placeholder)}" maxlength="10000"></textarea>
        <div style="margin-top: 8px;">
          <input type="email" placeholder="your@email.com (optional)" maxlength="255"/>
        </div>
        <p class="error" hidden></p>
        <div class="row">
          <span class="hint">↩ Enter to send</span>
          <button class="send" type="button">Send</button>
        </div>
      </div>
      <div class="success" hidden>
        <div class="check">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="m5 12.5 4 4 10-10"/>
          </svg>
        </div>
        <p style="margin:0">${V(q.theme.successMessage)}</p>
      </div>
    </div>
    <button class="bubble" aria-label="${V(q.theme.title)}">${S()}</button>
  `,J.appendChild(Q);let Z=Q.querySelector(".bubble"),M=Q.querySelector(".panel"),j=M.querySelector(".form"),v=M.querySelector(".success"),W=M.querySelector("textarea"),z=M.querySelector("input[type='email']"),N=M.querySelector("button.send"),X=M.querySelector(".error");function _(O){X.textContent=O,X.hidden=!1}function A(){X.hidden=!0,X.textContent=""}function F(){M.classList.add("open"),j.hidden=!1,v.hidden=!0,A(),setTimeout(()=>W.focus(),30)}function $(){M.classList.remove("open")}Z.addEventListener("click",()=>{if(M.classList.contains("open"))$();else F()});async function C(){let O=W.value.trim();if(!O){_("Add a message before sending.");return}N.disabled=!0,N.textContent="Sending…",A();try{let Y=await fetch(`${q.endpoint}/v1/feedback`,{method:"POST",credentials:"omit",headers:{"content-type":"application/json","x-beacon-public-key":q.publicKey},body:JSON.stringify({message:O,email:z.value.trim()||void 0,url:location.href,viewport:`${window.innerWidth}x${window.innerHeight}`})});if(!Y.ok){let I=await Y.json().catch(()=>({}));_(I.error??`Send failed (${Y.status}).`),N.disabled=!1,N.textContent="Send";return}j.hidden=!0,v.hidden=!1,W.value="",z.value="",N.disabled=!1,N.textContent="Send",setTimeout($,2200)}catch(Y){_("Network error."),N.disabled=!1,N.textContent="Send"}}N.addEventListener("click",()=>void C()),W.addEventListener("keydown",(O)=>{if(O.key==="Enter"&&!O.shiftKey)O.preventDefault(),C();if(O.key==="Escape")$()})}function V(G){return G.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}async function D(){let G=P();if(!G){console.warn("[beacon] no <script data-project=...> found");return}let q=G.dataset.project,J=G.dataset.endpoint??new URL(".",G.src).origin,R=await k(J,q),Q=U(G),Z={...L,...R,...Q},M=document.createElement("div");M.id="beacon-root",M.style.all="initial",document.body.appendChild(M),x(M,{endpoint:J,publicKey:q,theme:Z})}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>void D());else D();})();

/*
 * YouTube 全平台去广告 - 网页页面脚本
 *
 * [COMMON / 多客户端通用]
 * 仅共享稳定命名、版本、观测计数和恢复原则；不同代理客户端仍需独立适配与验证。
 *
 * [WEB / 网页专用]
 * Scope: Web only. 用于 Safari、Chrome 及移动网页，负责 HTML/CSP 注入、DOM 广告清理、
 * 跳过按钮、播放器广告态、临时静音加速和正片恢复。
 *
 * [MOBILE / 移动端专用]
 * 本文件只覆盖 m.youtube.com 网页，不处理 iPhone/iPad 原生 App protobuf。
 *
 * [TVOS / Apple TV 专用]
 * 本文件不在 Apple TV 上运行；tvOS 独有逻辑必须放入 scripts/tvos/ 并单独真机验证。
 */

// [WEB / 网页专用] Surge http-response 入口；只在完整 HTML 且尚未注入时改写响应。
const source = $response.body;

if (!source || !/<\/body>/i.test(source)) {
  $done({});
} else if (source.includes("data-youtube-adblock-skipper")) {
  $done({});
} else {
  const nonceMatch = source.match(/<script\b[^>]*\bnonce=(["'])([^"']+)\1/i);
  const cspHeader = Object.entries($response.headers || {}).find(
    ([name]) => name.toLowerCase() === "content-security-policy",
  )?.[1];
  const cspNonceMatch = String(cspHeader || "").match(/'nonce-([A-Za-z0-9+/_=-]+)'/i);
  const nonce = nonceMatch?.[2] || cspNonceMatch?.[1] || "";
  const nonceAttribute = /^[A-Za-z0-9+/_=-]+$/.test(nonce)
    ? ` nonce="${nonce}"`
    : "";
  const injectedStyle = `<style${nonceAttribute} data-youtube-adblock-style>
    #player-container-inner {
      background: #000 !important;
    }
    #movie_player[data-youtube-adblock-active="true"] {
      opacity: 0 !important;
    }
    ytd-ad-slot-renderer,
    ad-slot-renderer,
    ytd-display-ad-renderer,
    ytd-promoted-sparkles-web-renderer,
    ytd-in-feed-ad-layout-renderer,
    ytd-promoted-video-renderer,
    ytd-compact-promoted-video-renderer,
    ytd-search-pyv-renderer,
    ytd-video-masthead-ad-v3-renderer,
    ytd-masthead-ad-v3-renderer,
    ytd-action-companion-ad-renderer,
    ytd-player-legacy-desktop-watch-ads-renderer,
    ytm-promoted-video-renderer,
    ytm-promoted-sparkles-web-renderer,
    ytm-companion-ad-renderer,
    #masthead-ad,
    #contents > ytd-rich-item-renderer:has(> ytd-ad-slot-renderer),
    ytd-rich-item-renderer:has(> #content > ytd-ad-slot-renderer),
    #shorts-inner-container > .ytd-shorts:has(> .ytd-reel-video-renderer > ytd-ad-slot-renderer) {
      display: none !important;
    }
  </style>`;
  const injectedScript = `<script${nonceAttribute} data-youtube-adblock-skipper>(()=>{
    // [COMMON / 多客户端通用] 运行时名称和诊断快照保持客户端无关，便于跨适配器排障。
    const VERSION="1.2.10";
    const activeRuntime=window.__youtubeAdBlockRuntime;
    if(activeRuntime){
      if(activeRuntime.version===VERSION){
        if(typeof activeRuntime.run==="function")activeRuntime.run();
        return;
      }
      try{
        if(typeof activeRuntime.dispose==="function")activeRuntime.dispose();
        else if(typeof activeRuntime.restore==="function")activeRuntime.restore();
      }catch(_){
        // 旧版本运行时无法释放时，继续安装当前版本，避免更新后永久停留在旧逻辑。
      }
    }
    const counters={
      scans:0,
      removedNodes:0,
      skipClicks:0,
      acceleratedTicks:0,
      serverSideSkips:0,
      restores:0,
      errors:0
    };
    const errors=[];
    const runtime={
      version:VERSION,
      startedAt:Date.now(),
      lastAction:null,
      snapshot(){
        return {
          version:VERSION,
          startedAt:this.startedAt,
          lastAction:this.lastAction,
          counters:{...counters},
          errors:[...errors]
        };
      }
    };
    window.__youtubeAdBlockRuntime=runtime;
    document.documentElement?.setAttribute?.("data-youtube-adblock-version",VERSION);
    // [WEB / 网页专用] 以下选择器和播放器 API 仅对应 YouTube Web DOM，不可复制到原生端。
    const skipButtonSelectors=[
      ".ytp-ad-skip-button-modern",
      ".ytp-ad-skip-button",
      ".ytp-skip-ad-button",
      ".ytp-ad-skip-button-container button"
    ];
    const skipLabelPatterns=[
      /^(?:跳过(?:广告)?|skip(?:\\s+(?:ad|ads))?)$/i,
      /^(?:広告をスキップ|광고 건너뛰기|omitir anuncio|ignorer l'annonce|werbung überspringen|pular anúncio)$/i
    ];
    const adSignalSelectors=[
      ".ytp-ad-text",
      ".ytp-ad-preview-container",
      ".ytp-ad-player-overlay",
      ".ytp-ad-simple-ad-badge",
      ".ytp-ad-skip-button-container"
    ];
    const directAdSelectors=[
      "ytd-ad-slot-renderer",
      "ad-slot-renderer",
      "ytd-display-ad-renderer",
      "ytd-promoted-sparkles-web-renderer",
      "ytd-in-feed-ad-layout-renderer",
      "ytd-promoted-video-renderer",
      "ytd-compact-promoted-video-renderer",
      "ytd-search-pyv-renderer",
      "ytd-video-masthead-ad-v3-renderer",
      "ytd-masthead-ad-v3-renderer",
      "ytd-action-companion-ad-renderer",
      "ytd-player-legacy-desktop-watch-ads-renderer",
      "ytm-promoted-video-renderer",
      "ytm-promoted-sparkles-web-renderer",
      "ytm-companion-ad-renderer",
      "#masthead-ad"
    ];
    const structuralAdSelectors=[
      "#contents > ytd-rich-item-renderer:has(> ytd-ad-slot-renderer)",
      "ytd-rich-item-renderer:has(> #content > ytd-ad-slot-renderer)",
      "#shorts-inner-container > .ytd-shorts:has(> .ytd-reel-video-renderer > ytd-ad-slot-renderer)",
      ".ytd-watch-flexy > .ytd-watch-next-secondary-results-renderer > ytd-ad-slot-renderer.ytd-watch-next-secondary-results-renderer",
      "ytd-item-section-renderer > .ytd-item-section-renderer > ytd-ad-slot-renderer.style-scope"
    ];
    const directAdSelector=directAdSelectors.join(",");
    const structuralAdSelector=structuralAdSelectors.join(",");
    const clickedButtons=new WeakMap();
    const skipRetryDelay=750;
    const timers=[];
    const eventCleanups=[];
    let observer=null;
    let restoreState=null;
    let visualAdPlayer=null;
    let cleanupPending=false;
    function remember(action){
      runtime.lastAction={action,time:Date.now()};
    }
    function rememberError(error){
      counters.errors+=1;
      errors.push(String(error));
      if(errors.length>5)errors.shift();
    }
    function isVisible(element){
      if(!(element instanceof HTMLElement))return false;
      if(element.offsetParent!==null)return true;
      try{
        const rects=element.getClientRects?.();
        return Boolean(rects&&rects.length);
      }catch(_){
        return false;
      }
    }
    function findActiveVideo(player){
      const playerVideos=Array.from(player?.querySelectorAll?.("video")||[]);
      const firstPlayerVideo=player?.querySelector?.("video");
      if(firstPlayerVideo&&!playerVideos.includes(firstPlayerVideo))playerVideos.push(firstPlayerVideo);
      const documentVideos=Array.from(document.querySelectorAll("video"));
      const videos=Array.from(new Set([...playerVideos,...documentVideos]));
      return (
        videos.find(candidate=>!candidate.paused&&candidate.readyState>=2)||
        videos.find(candidate=>Number.isFinite(candidate.duration)&&candidate.duration>0)||
        playerVideos[0]||
        documentVideos[0]||
        null
      );
    }
    function setVisualAdState(player,active){
      try{
        if(visualAdPlayer&&visualAdPlayer!==player){
          visualAdPlayer.removeAttribute?.("data-youtube-adblock-active");
        }
        if(!player){
          visualAdPlayer=null;
          return;
        }
        if(active){
          player.setAttribute?.("data-youtube-adblock-active","true");
          visualAdPlayer=player;
        }else{
          player.removeAttribute?.("data-youtube-adblock-active");
          if(visualAdPlayer===player)visualAdPlayer=null;
        }
      }catch(error){
        rememberError(error);
      }
    }
    function restoreVideo(){
      if(!restoreState)return;
      const video=restoreState.video;
      try{
        if(video){
          video.muted=restoreState.muted;
          video.playbackRate=restoreState.playbackRate;
        }
        counters.restores+=1;
        remember("restore-video");
      }catch(error){
        rememberError(error);
      }
      restoreState=null;
    }
    function labelsFor(button){
      return [button.getAttribute?.("aria-label"),button.ariaLabel,button.textContent]
        .filter(Boolean)
        .map(label=>String(label).trim());
    }
    function isSkipButton(button){
      return labelsFor(button).some(label=>skipLabelPatterns.some(pattern=>pattern.test(label)));
    }
    function clickSkipButtons(player){
      const candidates=new Set();
      for(const selector of skipButtonSelectors){
        for(const button of document.querySelectorAll(selector))candidates.add(button);
      }
      for(const button of player?.querySelectorAll?.("button")||[]){
        if(isSkipButton(button))candidates.add(button);
      }
      let visibleCount=0;
      for(const button of candidates){
        if(!isVisible(button))continue;
        visibleCount+=1;
        const lastClick=clickedButtons.get(button)||0;
        if(Date.now()-lastClick<skipRetryDelay)continue;
        try{
          button.click();
          clickedButtons.set(button,Date.now());
          counters.skipClicks+=1;
          remember("click-skip");
        }catch(error){
          rememberError(error);
        }
      }
      return visibleCount;
    }
    function skipServerSideAd(player){
      try{
        const debugInfo=String(player?.getStatsForNerds?.()?.debug_info||"");
        if(!/^SSAP,\\s*AD\\b/i.test(debugInfo))return false;
        const progress=player?.getProgressState?.();
        const current=Number(progress?.current);
        const duration=Number(progress?.duration);
        if(!Number.isFinite(duration)||duration<=0)return true;
        if(!Number.isFinite(current)||duration-current>0.25){
          player?.seekTo?.(duration);
          counters.serverSideSkips+=1;
          remember("skip-ssap");
        }
        return true;
      }catch(error){
        rememberError(error);
        return false;
      }
    }
    function hasPlayerApiAd(player){
      try{
        const adState=player?.getAdState?.();
        return (
          (Number.isFinite(adState)&&adState>=0)||
          player?.isLifaAdPlaying?.()===true
        );
      }catch(error){
        rememberError(error);
        return false;
      }
    }
    function skipAd(){
      const player=document.querySelector("#movie_player");
      const video=findActiveVideo(player);
      const adShowing=Boolean(player?.classList?.contains?.("ad-showing"));
      const adInterrupting=Boolean(player?.classList?.contains?.("ad-interrupting"));
      const playerApiAd=hasPlayerApiAd(player);
      const hasVisibleAdSignal=adSignalSelectors.some(selector=>
        Array.from(document.querySelectorAll(selector)).some(isVisible)
      );
      const serverSideAd=skipServerSideAd(player);
      const visibleSkipButtons=(adShowing||adInterrupting||playerApiAd)?clickSkipButtons(player):0;
      const clientSideAd=Boolean(
        player&&(
          playerApiAd||
          adInterrupting||
          (adShowing&&(
            hasVisibleAdSignal||
            visibleSkipButtons>0
          ))
        )
      );
      const activeAd=Boolean((clientSideAd||serverSideAd)&&video);
      setVisualAdState(player,activeAd);
      if(!activeAd){
        restoreVideo();
        return;
      }
      if(!restoreState||restoreState.video!==video){
        restoreVideo();
        restoreState={video,muted:video.muted,playbackRate:video.playbackRate};
      }
      try{
        video.muted=true;
        video.playbackRate=16;
        counters.acceleratedTicks+=1;
        remember(serverSideAd?"accelerate-ssap":"accelerate-ad");
      }catch(error){
        rememberError(error);
      }
    }
    function removeFeedAds(){
      const nodes=new Set([
        ...document.querySelectorAll(directAdSelector),
        ...document.querySelectorAll(structuralAdSelector)
      ]);
      for(const node of nodes){
        try{
          node.remove();
          counters.removedNodes+=1;
          remember("remove-ad-node");
        }catch(error){
          rememberError(error);
        }
      }
    }
    function cleanPage(){
      counters.scans+=1;
      skipAd();
      removeFeedAds();
    }
    function safeCleanPage(){
      try{
        cleanPage();
      }catch(error){
        rememberError(error);
      }
    }
    function enforceActiveAdState(){
      if(!visualAdPlayer)return;
      const video=findActiveVideo(visualAdPlayer);
      if(!video)return;
      try{
        if(video.muted!==true)video.muted=true;
        if(video.playbackRate!==16)video.playbackRate=16;
      }catch(error){
        rememberError(error);
      }
    }
    function isPageVisible(){
      return document.hidden!==true&&document.visibilityState!=="hidden";
    }
    function scheduleCleanPage(){
      if(cleanupPending||!isPageVisible())return;
      cleanupPending=true;
      setTimeout(()=>{
        cleanupPending=false;
        if(isPageVisible())safeCleanPage();
      },100);
    }
    function addListener(target,name,handler){
      if(typeof target?.addEventListener!=="function")return;
      target.addEventListener(name,handler,true);
      eventCleanups.push(()=>target.removeEventListener?.(name,handler,true));
    }
    runtime.run=safeCleanPage;
    runtime.restore=()=>{
      setVisualAdState(null,false);
      restoreVideo();
    };
    runtime.dispose=()=>{
      try{
        observer?.disconnect?.();
        for(const timer of timers){
          if(typeof clearInterval==="function")clearInterval(timer);
        }
        for(const cleanup of eventCleanups)cleanup();
        runtime.restore();
        if(window.__youtubeAdBlockRuntime===runtime)delete window.__youtubeAdBlockRuntime;
      }catch(error){
        rememberError(error);
      }
    };
    observer=new MutationObserver(scheduleCleanPage);
    observer.observe(document.documentElement,{subtree:true,childList:true});
    addListener(document,"yt-navigate-finish",scheduleCleanPage);
    addListener(document,"yt-page-data-updated",scheduleCleanPage);
    // [WEB / 网页专用] YouTube 可能在广告态期间自行触发 volume/rate 变更；捕获后立即恢复临时广告状态。
    addListener(document,"volumechange",enforceActiveAdState);
    addListener(document,"ratechange",enforceActiveAdState);
    addListener(document,"visibilitychange",()=>{
      if(isPageVisible())safeCleanPage();
    });
    addListener(window,"popstate",scheduleCleanPage);
    timers.push(setInterval(()=>{
      if(isPageVisible())removeFeedAds();
    },2000));
    timers.push(setInterval(()=>{
      if(isPageVisible())skipAd();
    },300));
    safeCleanPage();
  })();</script>`;
  // [WEB / 网页专用] 写回 HTML 并移除长度/压缩头，让代理客户端重新计算响应体元数据。
  const body = source.replace(/<\/body>/i, `${injectedStyle}${injectedScript}</body>`);
  const headers = { ...($response.headers || {}) };
  const replacedHeaders = new Set([
    "cache-control",
    "pragma",
    "expires",
    "etag",
    "last-modified",
    "content-length",
  ]);
  for (const name of Object.keys(headers)) {
    if (replacedHeaders.has(name.toLowerCase())) delete headers[name];
  }
  headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
  headers.Pragma = "no-cache";
  headers.Expires = "0";
  console.log(`YouTube Web page: injected ad skipper, nonce=${nonceMatch ? "yes" : "no"}`);
  $done({ body, headers });
}

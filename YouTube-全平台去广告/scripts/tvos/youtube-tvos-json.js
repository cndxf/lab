/*
 * YouTube 全平台去广告 - Apple TV JSON 响应回退脚本
 *
 * [TVOS / Apple TV 专用]
 * tvOS 某些版本会把 player 响应返回为 JSON，而不是移动端使用的
 * protobuf/UMP。这里仅删除已知的广告调度和广告追踪字段，其他播放状态
 * 原样保留；加密 initplayback 仍由原生 UMP 脚本处理。
 *
 * [安全边界]
 * 不请求外部 Worker，不读取账号或播放密钥，不修改视频流地址。
 */
(() => {
  const response = typeof $response === "object" && $response ? $response : {};
  const body = response.body;

  if (typeof body !== "string" || body.length === 0) {
    $done({});
    return;
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    // 非 JSON 响应交给 YouTube 原样处理，避免破坏播放。
    $done({});
    return;
  }

  const adFields = new Set([
    "playerAds",
    "adPlacements",
    "adSlots",
    "adBreaks",
    "adBreakStatus",
    "adBreakHeartbeatParams",
    "adPlaybackContext",
    "adLayoutMetadata",
  ]);
  const adRendererFields = new Set([
    "adPlacementRenderer",
    "adSlotRenderer",
    "adBreakRenderer",
    "adInfoRenderer",
    "playerAdRenderer",
    "inPlayerAdLayoutRenderer",
  ]);
  let changed = false;

  const isAdRendererObject = (value) =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).some((key) => adRendererFields.has(key));

  const visit = (value) => {
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        if (isAdRendererObject(value[index])) {
          value.splice(index, 1);
          changed = true;
          continue;
        }
        visit(value[index]);
      }
      return;
    }

    if (!value || typeof value !== "object") return;

    for (const key of Object.keys(value)) {
      if (adFields.has(key) || key === "pageadViewthroughconversion") {
        delete value[key];
        changed = true;
        continue;
      }
      visit(value[key]);
    }
  };

  visit(payload);
  $done(changed ? { body: JSON.stringify(payload) } : {});
})();

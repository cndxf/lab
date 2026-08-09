/*
 * YouTube 全平台去广告 - 网页 API 响应脚本
 *
 * [COMMON / 多客户端通用]
 * 使用 $request/$response/$done 的最小运行时契约；域名、版本和安全边界可供适配器复用，
 * 但 Surge、Stash、Shadowrocket 的配置语法与缓存行为必须分别验证。
 *
 * [WEB / 网页专用]
 * Scope: Web only. 清理 www.youtube.com 与 m.youtube.com 的 JSON 列表广告结构。
 * 安全边界：只定向删除 player 的 SSAP 配置和 player/ad_break 返回的广告调度字段；
 * 不删除完整 player/get_watch 的广告状态或视频流地址，避免破坏播放器恢复。
 *
 * [MOBILE / 移动端专用]
 * 本文件不处理 iPhone/iPad 原生 App 的 protobuf 二进制响应。
 *
 * [TVOS / Apple TV 专用]
 * 本文件不处理 tvOS；Apple TV 独有接口必须在 scripts/tvos/ 中单独实现和留证。
 */

// [WEB / 网页专用] 入口仅接受可解析的 JSON 文本，二进制响应交给 native 脚本。
const source = $response.body;

if (!source) {
  $done({});
} else {
  try {
    const payload = JSON.parse(source);
    const endpointMatch = $request.url.match(/\/youtubei\/v1\/([^?]+)/);
    const endpoint = endpointMatch ? endpointMatch[1] : "unknown";
    const isAdBreakEndpoint = endpoint === "player/ad_break";
    const stats = {
      removed: 0,
      nestedJson: 0,
      ctierL: (source.match(/ctier(?:%3D|=)L/g) || []).length,
      paths: [],
    };

    // [WEB / 网页专用] 已确认属于网页渲染层的广告字段。
    const dropKeys = new Set([
      "adplacements",
      "adslots",
      "playerads",
      "ssapconfig",
      "adbreakheartbeatparams",
      "pageadviewthroughconversion",
      "adplacementrenderer",
      "adslotrenderer",
      "infeedadlayoutrenderer",
      "displayadrenderer",
      "promotedsparkleswebrenderer",
      "promotedvideorenderer",
      "compactpromotedvideorenderer",
      "searchpyvrenderer",
      "playeroverlayadrenderer",
      "adbreakservicerenderer",
      "adfeedbackrenderer",
      "adinforenderer",
      "adpreviewrenderer",
      "skipadrenderer",
      "visitadvertiserrenderer",
      "adcountdownrenderer",
      "addurationremainingrenderer",
      "adbuttonrenderer",
      "adplayeroverlay",
    ]);

    const nestedJsonKeys = new Set([
      "playerResponse",
      "watchNextResponse",
      "response",
    ]);

    const playerPassThroughKeys = new Set([
      "adplacements",
      "adslots",
      "playerads",
      "adbreakheartbeatparams",
      "pageadviewthroughconversion",
    ]);

    function remember(path) {
      stats.removed += 1;
      if (stats.paths.length < 12) stats.paths.push(path);
    }

    function isPlayerResponsePath(path) {
      return (
        (endpoint === "player" && path === "") ||
        path === "playerResponse" ||
        path.endsWith(".playerResponse")
      );
    }

    const adWrapperKeys = new Set([
      "richitemrenderer",
      "content",
      "renderer",
      "itemsectionrenderer",
    ]);

    function isShortsAdEntry(value) {
      return Boolean(
        endpoint === "reel/reel_watch_sequence" &&
          value?.command?.reelWatchEndpoint?.adClientParams?.isAd === true,
      );
    }

    function isAdItem(value, depth) {
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        depth > 4
      ) {
        return false;
      }

      if (
        value.isAd === true ||
        value.adClientParams != null ||
        value.adVideoId != null
      ) {
        return true;
      }

      for (const key of Object.keys(value)) {
        if (dropKeys.has(key.toLowerCase())) return true;
        const child = value[key];
        if (
          adWrapperKeys.has(key.toLowerCase()) &&
          child &&
          typeof child === "object" &&
          isAdItem(child, depth + 1)
        ) {
          return true;
        }
      }
      return false;
    }

    // [COMMON / 多客户端通用] 递归清理器只依赖普通 JSON；端点白名单和字段表仍属于网页层。
    function clean(value, path) {
      if (!value || typeof value !== "object") return;

      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index -= 1) {
          const itemPath = `${path}[${index}]`;
          if (isShortsAdEntry(value[index]) || isAdItem(value[index], 0)) {
            value.splice(index, 1);
            remember(itemPath);
          } else {
            clean(value[index], itemPath);
          }
        }
        return;
      }

      for (const key of Object.keys(value)) {
        const keyPath = path ? `${path}.${key}` : key;
        if (
          isAdBreakEndpoint &&
          path === "" &&
          (key.toLowerCase() === "playerads" ||
            key.toLowerCase() === "adthrottled")
        ) {
          delete value[key];
          remember(keyPath);
          continue;
        }
        if (
          isPlayerResponsePath(path) &&
          playerPassThroughKeys.has(key.toLowerCase())
        ) {
          continue;
        }
        if (dropKeys.has(key.toLowerCase())) {
          delete value[key];
          remember(keyPath);
          continue;
        }

        const child = value[key];
        const leadingWhitespace =
          typeof child === "string" ? child.match(/^\s*/)?.[0] || "" : "";
        const nestedJsonSource =
          typeof child === "string" ? child.slice(leadingWhitespace.length) : "";
        if (
          nestedJsonKeys.has(key) &&
          typeof child === "string" &&
          nestedJsonSource.length > 1 &&
          (nestedJsonSource[0] === "{" || nestedJsonSource[0] === "[")
        ) {
          try {
            const nested = JSON.parse(nestedJsonSource);
            const before = stats.removed;
            clean(nested, keyPath);
            if (stats.removed > before) {
              value[key] = leadingWhitespace + JSON.stringify(nested);
              stats.nestedJson += 1;
            }
          } catch (_) {
            // Some response fields are ordinary strings, not embedded JSON.
          }
          continue;
        }

        clean(child, keyPath);
      }
    }

    clean(payload, "");
    console.log(
      `YouTube Web ${endpoint}: removed=${stats.removed}, nested=${stats.nestedJson}, ctierL=${stats.ctierL}, paths=${stats.paths.join("|")}`,
    );

    if (stats.removed > 0) {
      $done({ body: JSON.stringify(payload) });
    } else {
      $done({});
    }
  } catch (error) {
    console.log(`YouTube Web: JSON parse failed: ${String(error)}`);
    $done({});
  }
}

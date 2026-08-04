/*
 * YouTube 全平台去广告 - 网页 API 响应脚本
 * Scope: Web only. 清理 www.youtube.com 与 m.youtube.com 的 JSON 广告结构。
 * Client boundary: 使用通用的 $request/$response/$done 接口，但每个客户端仍需真机验证。
 * Safety boundary: 不处理 player/get_watch 播放器广告状态，避免免费电影和长视频卡住。
 */

const source = $response.body;

if (!source) {
  $done({});
} else {
  try {
    const payload = JSON.parse(source);
    const endpointMatch = $request.url.match(/\/youtubei\/v1\/([^?]+)/);
    const endpoint = endpointMatch ? endpointMatch[1] : "unknown";
    const stats = {
      removed: 0,
      nestedJson: 0,
      ctierL: (source.match(/ctier(?:%3D|=)L/g) || []).length,
      paths: [],
    };

    const dropKeys = new Set([
      "adplacements",
      "adslots",
      "playerads",
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

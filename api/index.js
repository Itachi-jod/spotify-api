const axios = require("axios");

// Put your Kaiz key in env var KAIZ_APIKEY or fallback to the known key
const KAIZ_APIKEY = process.env.KAIZ_APIKEY || "7eac9dce-b646-4ad1-8148-5b58eddaa2cc";

function normalizeTrack(t) {
  if (!t || typeof t !== "object") return { raw: t };

  const title =
    t.title ||
    t.name ||
    t.track ||
    (t.meta && (t.meta.title || t.meta.name)) ||
    null;

  const artist =
    t.artist ||
    (t.artists && (Array.isArray(t.artists) ? t.artists.join(", ") : t.artists)) ||
    t.singer ||
    null;

  const album = t.album || (t.collection && t.collection.name) || null;

  const spotify_url =
    t.url ||
    t.link ||
    t.spotify_url ||
    (t.external_urls && t.external_urls.spotify) ||
    t.shareUrl ||
    null;

  // Many providers use different keys for downloadable/streamable audio
  const audio =
    t.download_url ||
    t.downloadUrl ||
    t.download_link ||
    t.stream ||
    t.stream_url ||
    t.preview_url ||
    t.preview ||
    t.audio ||
    t.mp3 ||
    t.file ||
    null;

  const id =
    t.id ||
    t.track_id ||
    t.trackId ||
    (spotify_url ? spotify_url.split("/").pop().split("?")[0] : null);

  return { id, title, artist, album, spotify_url, audio, raw: t };
}

function findArrayInResponse(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.result)) return data.result;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.tracks)) return data.tracks;
  if (Array.isArray(data.data)) return data.data;

  // fallback: pick the first array-like property with track-like items
  for (const k of Object.keys(data)) {
    if (Array.isArray(data[k]) && data[k].length > 0) {
      const arr = data[k];
      const looksLikeTrack = arr.some(item =>
        item && (item.title || item.name || item.url || item.download_url)
      );
      if (looksLikeTrack) return arr;
    }
  }

  // If object itself looks like a single track, wrap it
  if (data && (data.title || data.name || data.url || data.download_url)) {
    return [data];
  }

  return [];
}

module.exports = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) {
      return res.status(400).json({ success: false, message: "Missing query param `q`" });
    }

    // Build Kaiz API URL
    const kaizUrl = `https://kaiz-apis.gleeze.com/api/spotify-search?q=${encodeURIComponent(q)}&apikey=${KAIZ_APIKEY}`;

    // Fetch Kaiz response
    const kaizResp = await axios.get(kaizUrl, { timeout: 20000 });
    const kaizData = kaizResp.data;

    // Extract array of tracks (multiple formats supported)
    const rawArray = findArrayInResponse(kaizData);
    const results = rawArray.map(normalizeTrack);

    if (!results || results.length === 0) {
      // Return the raw Kaiz response to help debug
      return res.status(404).json({
        success: false,
        message: "No results found (no track-like items).",
        raw: kaizData
      });
    }

    // mark whether each result has a direct audio link
    results.forEach(r => { r.hasAudio = !!r.audio; });

    // If ?stream=1 requested, stream the chosen result's audio
    const streamFlag = req.query.stream === "1" || req.query.stream === "true";
    if (streamFlag) {
      const index = Math.max(0, parseInt(req.query.index || "0", 10));
      const id = req.query.id;

      // choose by id if provided, else index (default 0)
      let chosen = null;
      if (id) chosen = results.find(x => x.id === id || (x.spotify_url && x.spotify_url.includes(id)));
      if (!chosen) chosen = results[index] || results[0];

      if (!chosen) {
        return res.status(404).json({ success: false, message: "No track chosen to stream." });
      }
      if (!chosen.audio) {
        return res.status(404).json({ success: false, message: "Chosen track has no downloadable/streamable audio.", track: chosen });
      }

      // Proxy and stream the audio
      const audioResp = await axios.get(chosen.audio, { responseType: "stream", timeout: 20000 });

      const ct = audioResp.headers["content-type"] || "audio/mpeg";
      if (res.setHeader) {
        res.setHeader("Content-Type", ct);
        if (audioResp.headers["content-length"]) res.setHeader("Content-Length", audioResp.headers["content-length"]);
        res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
      }
      // Pipe provider stream directly to client
      return audioResp.data.pipe(res);
    }

    // Default: return structured JSON results
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    return res.json({
      success: true,
      query: q,
      count: results.length,
      results
    });
  } catch (err) {
    console.error("spotify-api error:", err.message || err);
    if (err.response && err.response.data) {
      return res.status(err.response.status || 500).json({ success: false, message: "Provider error", details: err.response.data });
    }
    return res.status(500).json({ success: false, message: "Internal server error", error: err.message });
  }
};

const axios = require("axios");

module.exports = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Missing query param `q`"
      });
    }

    const KAIZ_APIKEY = process.env.KAIZ_APIKEY || "7eac9dce-b646-4ad1-8148-5b58eddaa2cc";
    const searchUrl = `https://kaiz-apis.gleeze.com/api/spotify-search?q=${encodeURIComponent(q)}&apikey=${KAIZ_APIKEY}`;

    // Search Spotify
    const searchResp = await axios.get(searchUrl, { timeout: 15000 });
    const data = searchResp.data;

    if (!data || !data.success || !data.result || data.result.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No results found"
      });
    }

    // Get first track
    const track = data.result[0];
    if (!track.downloadUrl) {
      return res.status(502).json({
        success: false,
        message: "No audio URL available for this track"
      });
    }

    // Fetch audio stream
    const audioResp = await axios.get(track.downloadUrl, {
      responseType: "arraybuffer",
      timeout: 20000
    });

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
    res.setHeader("Content-Type", "audio/mpeg");

    return res.status(200).send(Buffer.from(audioResp.data));
  } catch (err) {
    console.error("API error:", err.message || err);
    if (err.response?.data) {
      const bodyCt = err.response.headers?.["content-type"];
      if (bodyCt?.includes("application/json")) {
        try {
          return res
            .status(err.response.status || 502)
            .json(err.response.data);
        } catch {}
      }
    }
    return res.status(500).json({
      success: false,
      message: "Failed to process request",
      error: err.message
    });
  }
};

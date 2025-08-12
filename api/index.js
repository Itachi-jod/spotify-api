import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ error: "Please provide a search query ?q=" });
    }

    const API_URL = `https://kaiz-apis.gleeze.com/api/spotify-search?q=${encodeURIComponent(q)}&apikey=7eac9dce-b646-4ad1-8148-5b58eddaa2cc`;

    const response = await fetch(API_URL);
    const data = await response.json();

    if (!data || !data.result || data.result.length === 0) {
      return res.status(404).json({ error: "No results found" });
    }

    // Return the first music result with audio preview link
    const firstTrack = data.result[0];
    res.status(200).json({
      title: firstTrack.title,
      artist: firstTrack.artist,
      album: firstTrack.album,
      spotify_url: firstTrack.url,
      audio_preview: firstTrack.preview_url || "No preview available"
    });

  } catch (error) {
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
}

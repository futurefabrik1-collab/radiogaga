// Buffer integration — auto-posts clips to connected social channels.
// Retries gracefully if Buffer API is down. Posts new unposted clips.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKEN = process.env.BUFFER_ACCESS_TOKEN;
const CLIP_INDEX = join(process.cwd(), 'data', 'clips', 'clips.json');
const API = 'https://api.bufferapp.com/1';

async function getProfiles() {
  const res = await fetch(`${API}/profiles.json?access_token=${TOKEN}`);
  if (!res.ok) throw new Error(`Buffer API ${res.status}`);
  return res.json();
}

async function createPost(profileId, text, mediaUrl = null) {
  const body = {
    text,
    profile_ids: [profileId],
    access_token: TOKEN,
  };
  if (mediaUrl) body.media = { link: mediaUrl };

  const res = await fetch(`${API}/updates/create.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Buffer post failed: ${res.status}`);
  return res.json();
}

export async function postUnpostedClips() {
  if (!TOKEN) return;

  let clips;
  try {
    clips = JSON.parse(readFileSync(CLIP_INDEX, 'utf8'));
  } catch { return; }

  const unposted = clips.filter(c => !c.posted && c.videoPath);
  if (!unposted.length) return;

  let profiles;
  try {
    profiles = await getProfiles();
    if (!profiles?.length) {
      console.log('[buffer] No profiles connected');
      return;
    }
  } catch (err) {
    // Buffer API might still be down — silently skip
    console.warn(`[buffer] API unavailable: ${err.message}`);
    return;
  }

  for (const clip of unposted.slice(0, 2)) { // max 2 per run
    const videoUrl = `https://www.radiogaga.ai/clips/clip-${clip.id}.mp4`;
    const text = clip.caption || '🤖📻 Live from radioGAGA #AIradio';

    try {
      for (const profile of profiles) {
        await createPost(profile.id, text, videoUrl);
        console.log(`[buffer] Posted to ${profile.service}: ${text.slice(0, 40)}`);
      }
      clip.posted = true;
    } catch (err) {
      console.warn(`[buffer] Post failed: ${err.message}`);
      break; // stop on first failure
    }
  }

  // Save updated index
  writeFileSync(CLIP_INDEX, JSON.stringify(clips, null, 2));
}

export function startBufferPoster() {
  if (!TOKEN) {
    console.log('[buffer] No BUFFER_ACCESS_TOKEN — skipping');
    return;
  }
  // Check for unposted clips every 30 min
  setInterval(() => postUnpostedClips().catch(() => {}), 30 * 60_000);
  // First check after 10 min
  setTimeout(() => postUnpostedClips().catch(() => {}), 10 * 60_000);
  console.log('[buffer] Auto-poster scheduled (every 30min)');
}

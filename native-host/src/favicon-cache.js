'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { logger } = require('./logger');

const CACHE_DIR = path.join(os.homedir(), '.raycast-firefox', 'favicons');
const MAX_MEMORY_ENTRIES = 500;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FETCH_TIMEOUT_MS = 5000; // 5 seconds

/** @type {Map<string, { dataUri: string, timestamp: number }>} */
const memoryCache = new Map();

/**
 * SHA-256 hash of a URL string, returned as hex.
 * Used as the disk cache filename.
 */
function cacheKey(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

/**
 * Synchronous cache lookup. Checks memory first, then disk.
 * Returns the data URI string on hit, or null on miss.
 */
function get(url) {
  // Check memory cache
  const memEntry = memoryCache.get(url);
  if (memEntry) {
    if (Date.now() - memEntry.timestamp < MAX_AGE_MS) {
      return memEntry.dataUri;
    }
    // Expired -- remove from memory
    memoryCache.delete(url);
  }

  // Check disk cache
  try {
    const filePath = path.join(CACHE_DIR, cacheKey(url));
    const stat = fs.statSync(filePath);
    if (Date.now() - stat.mtimeMs < MAX_AGE_MS) {
      const dataUri = fs.readFileSync(filePath, 'utf-8');
      // Promote to memory cache
      memoryCache.set(url, { dataUri, timestamp: stat.mtimeMs });
      return dataUri;
    }
    // Expired on disk -- remove
    try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
  } catch (err) {
    // File not found or read error -- cache miss
  }

  return null;
}

/**
 * Write a favicon data URI to both memory and disk cache.
 */
function set(url, dataUri) {
  // Evict oldest entry if at capacity
  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }

  memoryCache.set(url, { dataUri, timestamp: Date.now() });

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, cacheKey(url)), dataUri);
  } catch (err) {
    logger.warn({ err: err.message, url }, 'Failed to write favicon to disk cache');
  }
}

/**
 * Fetch a favicon from its URL via HTTPS, convert to base64 data URI,
 * store in cache, and return the data URI. Returns null on any error.
 */
async function fetchAndCache(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || 'image/x-icon';
    const buffer = Buffer.from(await response.arrayBuffer());
    const dataUri = `data:${contentType};base64,${buffer.toString('base64')}`;
    set(url, dataUri);
    return dataUri;
  } catch (err) {
    logger.warn({ err: err.message, url }, 'Favicon fetch failed');
    return null;
  }
}

/**
 * Get a favicon from cache, or fetch and cache it if not found.
 * Returns the data URI string, or null if unavailable.
 */
async function getOrFetch(url) {
  const cached = get(url);
  if (cached) return cached;
  return fetchAndCache(url);
}

module.exports = { get, set, fetchAndCache, getOrFetch, CACHE_DIR };

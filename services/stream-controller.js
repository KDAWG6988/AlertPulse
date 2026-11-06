/**
 * services/stream-controller.js — Manages the alarm simulation stream.
 *
 * Starts a background interval that generates alarm events, classifies them
 * via the triage engine, and writes results to the database.
 *
 * Exposes the live alarm feed via an in-memory ring buffer (last 200 events).
 * The /api/alarms/stream endpoint consumes from this buffer via polling.
 */
const { tick } = require('./alarm-simulator');
const { classify } = require('./triage-engine');
const { insertAlarmEvent, insertTriageDecision } = require('../db/alarms');

const RING_SIZE = 200;
const alarmFeed = [];
let streamActive = false;
let intervalHandle = null;

/**
 * Start the simulation loop.
 * @param {number} intervalMs - milliseconds between ticks (default 3000)
 */
async function start(intervalMs = 3000) {
  if (streamActive) return;
  streamActive = true;

  console.log(`[Stream] Alarm triage stream started — tick every ${intervalMs}ms`);

  intervalHandle = setInterval(async () => {
    try {
      const rawEvents = tick();
      for (const raw of rawEvents) {
        const event = await insertAlarmEvent(raw);
        const decision = classify({ ...raw, id: event.id });
        await insertTriageDecision(decision);

        // Push to ring buffer (newest first)
        alarmFeed.unshift({ ...raw, id: event.id, ...decision, created_at: event.created_at });
        if (alarmFeed.length > RING_SIZE) alarmFeed.pop();
      }
    } catch (err) {
      console.error('[Stream] Error processing alarm:', err.message);
    }
  }, intervalMs);
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  streamActive = false;
  console.log('[Stream] Alarm triage stream stopped');
}

/** Returns the last N events from the ring buffer. */
function getFeed(n = 50) {
  return alarmFeed.slice(0, n);
}

/** Returns whether the stream is running. */
function isActive() {
  return streamActive;
}

module.exports = { start, stop, getFeed, isActive };
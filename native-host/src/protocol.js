'use strict';

const MAX_INBOUND_SIZE = 512 * 1024; // 512KB
const MAX_OUTBOUND_SIZE = 1024 * 1024; // 1MB (Firefox's limit)

/**
 * Creates a decoder for the native messaging length-prefixed binary protocol.
 *
 * Each message is: [4-byte UInt32LE length prefix][UTF-8 JSON body]
 *
 * The returned function should be called with each stdin data chunk.
 * Handles partial reads (message split across chunks) and multiple messages
 * in a single chunk.
 *
 * @param {function} onMessage - called with parsed JS object for each message
 * @param {object} [log] - optional logger with .error() method
 * @returns {function} decoder function to call with each Buffer chunk
 */
function createDecoder(onMessage, log) {
  const chunks = [];
  let bufferedLength = 0;
  let expectedLength = 0;

  return function decode(chunk) {
    chunks.push(chunk);
    bufferedLength += chunk.length;

    while (true) {
      // Need at least 4 bytes to read the length prefix
      if (expectedLength === 0 && bufferedLength >= 4) {
        const buf = Buffer.concat(chunks);
        chunks.length = 0;

        expectedLength = buf.readUInt32LE(0);

        // Check inbound size limit
        if (expectedLength > MAX_INBOUND_SIZE) {
          if (log) {
            log.error({ size: expectedLength, limit: MAX_INBOUND_SIZE }, 'Inbound message exceeds 512KB limit, skipping');
          }
          // Reset state -- skip this message
          const remaining = buf.subarray(4 + expectedLength);
          expectedLength = 0;
          if (remaining.length > 0) {
            chunks.push(remaining);
            bufferedLength = remaining.length;
          } else {
            bufferedLength = 0;
          }
          continue;
        }

        const remaining = buf.subarray(4);
        if (remaining.length > 0) {
          chunks.push(remaining);
          bufferedLength = remaining.length;
        } else {
          bufferedLength = 0;
        }
      }

      // Have full message body
      if (expectedLength > 0 && bufferedLength >= expectedLength) {
        const buf = Buffer.concat(chunks);
        chunks.length = 0;

        const messageBytes = buf.subarray(0, expectedLength);
        const remaining = buf.subarray(expectedLength);

        expectedLength = 0;
        bufferedLength = remaining.length;
        if (remaining.length > 0) {
          chunks.push(remaining);
        }

        const message = JSON.parse(messageBytes.toString('utf-8'));
        onMessage(message);
      } else {
        break;
      }
    }
  };
}

/**
 * Encodes a JS object as a native messaging binary message.
 *
 * Returns a Buffer containing: [4-byte UInt32LE length][UTF-8 JSON bytes]
 *
 * @param {object} message - JS object to encode
 * @returns {Buffer} length-prefixed binary message
 * @throws {Error} if encoded message exceeds 1MB (Firefox's outbound limit)
 */
function encode(message) {
  const json = JSON.stringify(message);
  const body = Buffer.from(json, 'utf-8');

  if (body.length > MAX_OUTBOUND_SIZE) {
    throw new Error(`Outbound message too large: ${body.length} bytes (max ${MAX_OUTBOUND_SIZE})`);
  }

  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);

  return Buffer.concat([header, body]);
}

module.exports = { createDecoder, encode };

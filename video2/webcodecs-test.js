/**
 * WebRTC & WebCodecs Capability Analyzer - WebCodecs Test Module
 * Executes real-time encode/decode loops using VideoEncoder and VideoDecoder.
 */

import { getWebCodecsCodecString } from './codec-utils.js';

/**
 * Runs an active WebCodecs end-to-end encode/decode test
 * @param {Object} testParams 
 * @param {string} testParams.codecKey - Codec key (H264, H265, VP8, VP9, AV1)
 * @param {number} testParams.width - Video width
 * @param {number} testParams.height - Video height
 * @param {number} testParams.bitrate - Target bitrate in bps
 * @param {string} testParams.scalabilityMode - Target WebCodecs scalability mode (optional)
 * @param {string} testParams.hardwareAcceleration - 'prefer-hardware' | 'prefer-software' | 'no-preference'
 * @param {number} testParams.timeoutMs - Timeout limit in milliseconds
 * @returns {Promise<{success: boolean, logs: string[], error?: string}>}
 */
export function runWebCodecsTest(testParams) {
    return new Promise(async (resolve) => {
        const logs = [];
        const log = (msg) => {
            const time = new Date().toISOString().split('T')[1].slice(0, -1);
            logs.push(`[${time}] ${msg}`);
        };

        log(`Starting WebCodecs test for codec: ${testParams.codecKey}`);
        log(`Resolution: ${testParams.width}x${testParams.height}, Bitrate: ${testParams.bitrate} bps`);
        log(`Hardware preference: ${testParams.hardwareAcceleration}`);
        if (testParams.scalabilityMode) {
            log(`Scalability Mode: ${testParams.scalabilityMode}`);
        }

        // Setup elements
        const canvas = document.getElementById('sharedCanvas');
        if (!canvas) {
            resolve({ success: false, logs, error: 'Shared testing canvas not found in DOM' });
            return;
        }
        // Dynamically resize canvas to match target dimensions!
        canvas.width = testParams.width;
        canvas.height = testParams.height;
        const ctx = canvas.getContext('2d');

        let encoder = null;
        let decoder = null;
        let frameCount = 0;
        let encodedCount = 0;
        let decodedCount = 0;
        let isFinished = false;
        let frameInterval = null;

        // Safe cleanup function
        const cleanup = () => {
            if (frameInterval) clearInterval(frameInterval);
            try {
                if (encoder && encoder.state !== 'closed') encoder.close();
                if (decoder && decoder.state !== 'closed') decoder.close();
            } catch (e) {
                log(`Cleanup error: ${e.message}`);
            }
        };

        // Timeout configuration
        const timeoutTracker = setTimeout(() => {
            if (isFinished) return;
            isFinished = true;
            cleanup();
            log(`Test timed out after ${testParams.timeoutMs}ms`);
            resolve({
                success: false,
                logs,
                error: `Timed out. Encoded: ${encodedCount}, Decoded: ${decodedCount}. Expected: 5 decoded frames.`
            });
        }, testParams.timeoutMs);

        try {
            const codecStr = getWebCodecsCodecString(testParams.codecKey);
            log(`Resolved MIME String: ${codecStr}`);

            // 1. Initialize Video Decoder
            decoder = new VideoDecoder({
                output: (frame) => {
                    decodedCount++;
                    log(`Decoder output frame #${decodedCount} (Timestamp: ${frame.timestamp}µs, Resolution: ${frame.displayWidth}x${frame.displayHeight})`);
                    frame.close(); // CRITICAL: Close frames to prevent memory leaks!

                    if (decodedCount >= 5 && !isFinished) {
                        log(`Successfully decoded ${decodedCount} frames. Criteria met.`);
                        isFinished = true;
                        clearTimeout(timeoutTracker);
                        cleanup();
                        resolve({ success: true, logs });
                    }
                },
                error: (err) => {
                    log(`Decoder error: ${err.message}`);
                    if (!isFinished) {
                        isFinished = true;
                        clearTimeout(timeoutTracker);
                        cleanup();
                        resolve({ success: false, logs, error: `Decoder Error: ${err.message}` });
                    }
                }
            });

            // 2. Initialize Video Encoder
            encoder = new VideoEncoder({
                output: (chunk, metadata) => {
                    encodedCount++;
                    log(`Encoder output chunk #${encodedCount} (Type: ${chunk.type}, Size: ${chunk.byteLength} bytes, Timestamp: ${chunk.timestamp}µs)`);

                    // Handle decoder initialization upon first chunk metadata
                    if (encodedCount === 1) {
                        if (metadata && metadata.decoderConfig) {
                            log(`Configuring VideoDecoder with metadata-supplied configuration: ${JSON.stringify(metadata.decoderConfig)}`);
                            decoder.configure(metadata.decoderConfig);
                        } else {
                            // Fallback configuration for browsers that do not supply decoderConfig in metadata (e.g., VP8)
                            log(`Metadata decoderConfig absent. Attempting fallback decoder configuration.`);
                            decoder.configure({
                                codec: codecStr,
                                codedWidth: testParams.width,
                                codedHeight: testParams.height,
                                displayAspectWidth: testParams.width,
                                displayAspectHeight: testParams.height,
                                optimizeForLatency: true
                            });
                        }
                    }

                    // Feed the encoded chunk directly to the decoder
                    if (decoder.state === 'configured') {
                        decoder.decode(chunk);
                    } else {
                        log(`WARNING: Decoder not configured yet. Dropping chunk #${encodedCount}`);
                    }
                },
                error: (err) => {
                    log(`Encoder error: ${err.message}`);
                    if (!isFinished) {
                        isFinished = true;
                        clearTimeout(timeoutTracker);
                        cleanup();
                        resolve({ success: false, logs, error: `Encoder Error: ${err.message}` });
                    }
                }
            });

            // 3. Configure Encoder
            const encoderConfig = {
                codec: codecStr,
                width: testParams.width,
                height: testParams.height,
                bitrate: testParams.bitrate,
                framerate: 30,
                latencyMode: 'realtime',
                hardwareAcceleration: testParams.hardwareAcceleration
            };

            // Omit scalabilityMode for non-SVC codecs (VP8, H.264, H.265) when it equals L1T1 (standard single-layer)
            if (testParams.scalabilityMode) {
                const isSVCSupportedCodec = testParams.codecKey === 'VP9' || testParams.codecKey === 'AV1';
                if (isSVCSupportedCodec || testParams.scalabilityMode !== 'L1T1') {
                    encoderConfig.scalabilityMode = testParams.scalabilityMode;
                }
            }

            log(`Configuring VideoEncoder with: ${JSON.stringify(encoderConfig)}`);
            encoder.configure(encoderConfig);
            log(`VideoEncoder configured.`);

            // 4. Frame generation loop
            let timestampUs = 0;
            frameInterval = setInterval(() => {
                if (isFinished) return;

                try {
                    frameCount++;
                    // Draw simple high-contrast moving gradient/pattern to canvas
                    ctx.fillStyle = '#0f172a'; // Midnight background
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    // Pulsing colored square
                    const pulse = Math.sin(frameCount * 0.1) * (canvas.width / 6) + (canvas.width / 3);
                    const gradient = ctx.createLinearGradient(pulse, 100, pulse + 300, 400);
                    gradient.addColorStop(0, '#3b82f6'); // accent color
                    gradient.addColorStop(1, '#ec4899'); // pink
                    ctx.fillStyle = gradient;
                    ctx.fillRect(pulse, canvas.height / 4, canvas.width / 4, canvas.height / 4);

                    // Text overlay
                    ctx.fillStyle = '#ffffff';
                    ctx.font = `bold ${Math.max(16, Math.floor(canvas.height / 12))}px sans-serif`;
                    ctx.fillText(`WebCodecs: ${testParams.codecKey}`, 20, canvas.height * 0.2);
                    ctx.fillText(`Frame: ${frameCount}`, 20, canvas.height * 0.4);
                    ctx.fillText(`Res: ${testParams.width}x${testParams.height}`, 20, canvas.height * 0.6);

                    // Extract VideoFrame from Canvas
                    // WebCodecs requires microsecond timestamps
                    const frame = new VideoFrame(canvas, { timestamp: timestampUs });
                    
                    // Check for keyframe request on first frame
                    const encodeOptions = { keyFrame: frameCount % 30 === 1 };
                    
                    if (encoder.state === 'configured') {
                        log(`Pumping frame #${frameCount} to VideoEncoder (Size: ${canvas.width}x${canvas.height}, Timestamp: ${timestampUs}µs, Keyframe: ${encodeOptions.keyFrame})`);
                        encoder.encode(frame, encodeOptions);
                        
                        // Force immediate chunk processing to bypass internal buffering latency
                        encoder.flush().then(() => {
                            log(`Flushed frame #${frameCount} successfully`);
                        }).catch(flushErr => {
                            log(`WARNING: Flush failed on frame #${frameCount}: ${flushErr.message || flushErr.toString()}`);
                        });
                    } else {
                        log(`WARNING: Encoder not configured (current state: '${encoder.state}'). Skipping encode for frame #${frameCount}`);
                    }
                    
                    timestampUs += 33333; // ~30 fps in microseconds
                    frame.close(); // CRITICAL: Close frame immediately to prevent GPU memory leaks
                } catch (intervalErr) {
                    log(`Frame generation loop exception: ${intervalErr.message || intervalErr.toString()}`);
                    if (!isFinished) {
                        isFinished = true;
                        clearTimeout(timeoutTracker);
                        cleanup();
                        resolve({ success: false, logs, error: `Frame loop error: ${intervalErr.message || intervalErr.toString()}` });
                    }
                }
            }, 33); // ~30 fps

            log(`Active frame injection loop initiated.`);

        } catch (err) {
            log(`Catch block caught error: ${err.message || err.toString()}`);
            cleanup();
            clearTimeout(timeoutTracker);
            resolve({ success: false, logs, error: err.message || err.toString() });
        }
    });
}

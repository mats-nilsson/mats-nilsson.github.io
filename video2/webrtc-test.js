/**
 * WebRTC & WebCodecs Capability Analyzer - WebRTC Test Module
 * Executes peer-to-peer loopback tests to verify active encoding, transmission, and statistics.
 */

import { CODECS, forceCodecInSdp } from './codec-utils.js';

/**
 * Runs an active WebRTC end-to-end loopback test
 * @param {Object} testParams 
 * @param {string} testParams.codecKey - Codec key (H264, H265, VP8, VP9, AV1)
 * @param {number} testParams.width - Video width
 * @param {number} testParams.height - Video height
 * @param {number} testParams.bitrate - Target max bitrate in bps
 * @param {string} testParams.scalabilityMode - Target WebRTC scalability mode (optional)
 * @param {boolean} testParams.isSimulcast - Whether to enable simulcast multi-encoding
 * @param {number} testParams.timeoutMs - Timeout limit in milliseconds
 * @returns {Promise<{success: boolean, logs: string[], error?: string, stats?: any}>}
 */
export function runWebRTCTest(testParams) {
    return new Promise(async (resolve) => {
        const logs = [];
        const log = (msg) => {
            const time = new Date().toISOString().split('T')[1].slice(0, -1);
            logs.push(`[${time}] ${msg}`);
        };

        log(`Starting WebRTC loopback test for codec: ${testParams.codecKey}`);
        log(`Resolution target: ${testParams.width}x${testParams.height}, Max Bitrate: ${testParams.bitrate} bps`);
        log(`Scalability Mode: ${testParams.scalabilityMode || 'L1T1'}`);
        log(`Simulcast: ${testParams.isSimulcast ? 'Yes' : 'No'}`);

        const spec = CODECS[testParams.codecKey];
        if (!spec) {
            resolve({ success: false, logs, error: `Unknown codec key: ${testParams.codecKey}` });
            return;
        }

        // Configure dynamic canvas source
        const canvas = document.getElementById('sharedCanvas');
        if (!canvas) {
            resolve({ success: false, logs, error: 'Shared testing canvas not found in DOM' });
            return;
        }

        // Set canvas dimensions to match target resolution
        canvas.width = testParams.width;
        canvas.height = testParams.height;
        const ctx = canvas.getContext('2d');

        let pc1 = null;
        let pc2 = null;
        let stream = null;
        let frameInterval = null;
        let statsInterval = null;
        let isFinished = false;

        // Safe cleanup
        const cleanup = () => {
            if (frameInterval) clearInterval(frameInterval);
            if (statsInterval) clearInterval(statsInterval);
            try {
                if (stream) {
                    stream.getTracks().forEach(t => t.stop());
                }
                if (pc1) pc1.close();
                if (pc2) pc2.close();
            } catch (e) {
                log(`Cleanup error: ${e.message}`);
            }
        };



        try {
            // 1. Get Canvas Capture Stream
            log(`Capturing local video track from animated canvas at ${testParams.width}x${testParams.height}`);
            stream = canvas.captureStream(30); // 30 fps
            const track = stream.getVideoTracks()[0];
            if (!track) {
                throw new Error('Failed to capture video track from canvas source');
            }

            // Start drawing animated content immediately so WebRTC has continuous frames
            let frameCount = 0;
            frameInterval = setInterval(() => {
                frameCount++;
                ctx.fillStyle = '#020617'; // Slate-950
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Moving orb
                const x = Math.cos(frameCount * 0.08) * (canvas.width / 3) + (canvas.width / 2);
                const y = Math.sin(frameCount * 0.12) * (canvas.height / 3) + (canvas.height / 2);
                
                const rad = ctx.createRadialGradient(x, y, 10, x, y, Math.min(canvas.width, canvas.height) / 4);
                rad.addColorStop(0, '#10b981'); // Emerald
                rad.addColorStop(1, '#3b82f6'); // Blue
                ctx.fillStyle = rad;
                ctx.beginPath();
                ctx.arc(x, y, Math.min(canvas.width, canvas.height) / 4, 0, Math.PI * 2);
                ctx.fill();

                // Dynamic text overlays
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${Math.max(16, Math.floor(canvas.height / 15))}px sans-serif`;
                ctx.fillText(`WebRTC Test: ${testParams.codecKey}`, 40, canvas.height * 0.15);
                ctx.fillText(`Frame: ${frameCount}`, 40, canvas.height * 0.25);
                ctx.fillText(`Target: ${testParams.width}x${testParams.height}`, 40, canvas.height * 0.35);
                ctx.fillText(`Mode: ${testParams.scalabilityMode || 'L1T1'}`, 40, canvas.height * 0.45);
            }, 33);

            // 2. Create Peer Connections
            pc1 = new RTCPeerConnection();
            pc2 = new RTCPeerConnection();

            log('RTCPeerConnections initialized.');

            // 3. Setup Candidate Exchange
            pc1.onicecandidate = (e) => {
                if (e.candidate && pc2.signalingState !== 'closed') {
                    pc2.addIceCandidate(e.candidate).catch(err => log(`Add ICE Candidate error: ${err}`));
                }
            };
            pc2.onicecandidate = (e) => {
                if (e.candidate && pc1.signalingState !== 'closed') {
                    pc1.addIceCandidate(e.candidate).catch(err => log(`Add ICE Candidate error: ${err}`));
                }
            };

            pc1.oniceconnectionstatechange = () => {
                log(`pc1 ICE connection state: ${pc1.iceConnectionState}`);
            };
            pc2.oniceconnectionstatechange = () => {
                log(`pc2 ICE connection state: ${pc2.iceConnectionState}`);
            };

            // Handle incoming track
            pc2.ontrack = (e) => {
                log(`pc2 successfully received incoming track: ${e.track.id} (${e.track.kind})`);
            };

            // 4. Add Transceiver on pc1 with encoding specifications
            const encodings = [];
            if (testParams.isSimulcast) {
                log('Setting up Simulcast encodings...');
                encodings.push(
                    { rid: 'f', maxBitrate: testParams.bitrate, scalabilityMode: testParams.scalabilityMode || 'L1T1' },
                    { rid: 'h', maxBitrate: Math.floor(testParams.bitrate / 4), scaleResolutionDownBy: 2, scalabilityMode: testParams.scalabilityMode || 'L1T1' },
                    { rid: 'q', maxBitrate: Math.floor(testParams.bitrate / 8), scaleResolutionDownBy: 4, scalabilityMode: testParams.scalabilityMode || 'L1T1' }
                );
            } else {
                const encodingObj = {
                    maxBitrate: testParams.bitrate
                };
                if (testParams.scalabilityMode) {
                    encodingObj.scalabilityMode = testParams.scalabilityMode;
                }
                encodings.push(encodingObj);
            }

            log(`Configuring local video transceiver encodings: ${JSON.stringify(encodings)}`);
            const transceiver = pc1.addTransceiver(track, {
                direction: 'sendonly',
                sendEncodings: encodings
            });

            // 5. Apply Codec Preferences if supported
            if (typeof RTCRtpReceiver.getCapabilities === 'function') {
                const capabilities = RTCRtpReceiver.getCapabilities('video');
                if (capabilities && capabilities.codecs) {
                    const targetMime = `video/${spec.webrtcCodecName.toUpperCase()}`;
                    const matchedCodecs = capabilities.codecs.filter(c => 
                        c.mimeType.toLowerCase() === targetMime.toLowerCase()
                    );

                    if (matchedCodecs.length > 0) {
                        log(`Applying codec preferences: ${matchedCodecs.map(c => `${c.mimeType} p:${c.sdpFmtpLine || ''}`).join(' | ')}`);
                        transceiver.setCodecPreferences(matchedCodecs);
                    } else {
                        log(`WARNING: Codec MIME ${targetMime} not found in browser capabilities. Relying entirely on SDP manipulation.`);
                    }
                }
            }

            // 6. Peer connection negotiation
            log('Creating SDP Offer...');
            const offer = await pc1.createOffer();
            log('Offered SDP original: ' + offer.sdp.split('\r\n').slice(0, 5).join(' | ') + '...');

            // Manipulate SDP to enforce target codec
            const forcedOfferSdp = forceCodecInSdp(offer.sdp, testParams.codecKey);
            log(`SDP offer forced codec mapping.`);

            await pc1.setLocalDescription({ type: 'offer', sdp: forcedOfferSdp });
            await pc2.setRemoteDescription(pc1.localDescription);

            log('Creating SDP Answer...');
            const answer = await pc2.createAnswer();
            const forcedAnswerSdp = forceCodecInSdp(answer.sdp, testParams.codecKey);
            
            await pc2.setLocalDescription({ type: 'answer', sdp: forcedAnswerSdp });
            await pc1.setRemoteDescription(pc2.localDescription);
            log('Peer exchange completed.');

            // 7. Await connection and verify stats
            log('Waiting for connection state to stabilize to connected/completed...');

            // Poll stats to check bytesSent and negotiate codecs
            let checkCount = 0;
            let lastBytesSent = 0;
            let mediaFlowing = false;
            const resolutionHistory = [];
            const maxChecks = Math.ceil(testParams.timeoutMs / 500);
            log(`Starting stats polling loop. Max checks until timeout: ${maxChecks}`);

            statsInterval = setInterval(async () => {
                if (isFinished) return;
                checkCount++;

                const elapsedMs = checkCount * 500;
                const isTimeoutReached = checkCount >= maxChecks;

                const state1 = pc1.iceConnectionState;
                const state2 = pc2.iceConnectionState;

                // Only start inspecting stats when ICE is connected
                if (state1 === 'connected' || state1 === 'completed') {
                    try {
                        // A. Fetch outbound-rtp from sender (pc1)
                        const statsReport1 = await pc1.getStats();
                        let outboundRtp = null;
                        let codecObj = null;

                        statsReport1.forEach(stat => {
                            if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
                                outboundRtp = stat;
                            }
                        });

                        // B. Fetch inbound-rtp from receiver (pc2)
                        const statsReport2 = await pc2.getStats();
                        let inboundRtp = null;
                        statsReport2.forEach(stat => {
                            if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
                                inboundRtp = stat;
                            }
                        });

                        if (outboundRtp) {
                            // Resolve codec configuration from stats
                            if (outboundRtp.codecId) {
                                const rawCodec = statsReport1.get(outboundRtp.codecId);
                                if (rawCodec) {
                                    codecObj = rawCodec;
                                }
                            }

                            const bytesSent = outboundRtp.bytesSent || 0;
                            const width = outboundRtp.frameWidth || 0;
                            const height = outboundRtp.frameHeight || 0;
                            const framesEncoded = outboundRtp.framesEncoded || 0;
                            const codecMime = codecObj ? codecObj.mimeType : 'unknown';
                            
                            // Retrieve implementation details
                            const encoderImpl = outboundRtp.encoderImplementation || 'unknown';
                            let decoderImpl = 'unknown';
                            if (inboundRtp) {
                                decoderImpl = inboundRtp.decoderImplementation || 'unknown';
                            }

                            const currentRes = `${width}x${height}`;
                            const elapsedMs = checkCount * 500;
                            const elapsedSec = (elapsedMs / 1000).toFixed(1);

                            // Record resolution history when it changes
                            if (width > 0 && height > 0) {
                                if (resolutionHistory.length === 0 || resolutionHistory[resolutionHistory.length - 1].res !== currentRes) {
                                    resolutionHistory.push({ time: elapsedSec, res: currentRes });
                                    log(`Resolution change measured: ${currentRes} at ${elapsedSec}s`);
                                }
                            }

                            // Validate media flow
                            if (bytesSent > lastBytesSent && framesEncoded > 0) {
                                mediaFlowing = true;
                            }

                            // Diagnostic properties dumper
                            if (checkCount === 2 || checkCount === 6) {
                                try {
                                    const outKeys = [];
                                    for (const k in outboundRtp) {
                                        if (typeof outboundRtp[k] !== 'function') {
                                            outKeys.push(`${k}: ${outboundRtp[k]}`);
                                        }
                                    }
                                    log(`[DIAGNOSTIC] outboundRtp properties: ${outKeys.slice(0, 30).join(' | ')}`);
                                    
                                    if (inboundRtp) {
                                        const inKeys = [];
                                        for (const k in inboundRtp) {
                                            if (typeof inboundRtp[k] !== 'function') {
                                                inKeys.push(`${k}: ${inboundRtp[k]}`);
                                            }
                                        }
                                        log(`[DIAGNOSTIC] inboundRtp properties: ${inKeys.slice(0, 30).join(' | ')}`);
                                    }
                                } catch (diagErr) {
                                    log(`[DIAGNOSTIC] Failed to dump properties: ${diagErr.message}`);
                                }
                            }

                            log(`Stats update #${checkCount} (${elapsedSec}s): Bytes Sent = ${bytesSent}, Encoded Frames = ${framesEncoded}, Resolution = ${currentRes}, Codec = ${codecMime}, Encoder = ${encoderImpl}, Decoder = ${decoderImpl}`);

                            // Success criteria validations
                            const isMatchingCodec = codecMime.toLowerCase().includes(spec.webrtcCodecName.toLowerCase());
                            const targetWidth = testParams.width;
                            const targetHeight = testParams.height;
                            const targetResReached = width === targetWidth && height === targetHeight;

                            // Case 1: Target resolution reached successfully! Escape early and resolve cleanly!
                            if (isMatchingCodec && targetResReached) {
                                const bothStatsPopulated = encoderImpl !== 'unknown' && decoderImpl !== 'unknown';
                                const allowResolve = bothStatsPopulated || checkCount >= 4;

                                if (allowResolve) {
                                    log(`Target resolution ${targetWidth}x${targetHeight} reached successfully in ${elapsedSec}s! Resolving cleanly.`);
                                    
                                    const targetScalability = testParams.scalabilityMode || 'L1T1';
                                    let activeScalability = outboundRtp.scalabilityMode || 'unknown';
                                    const warnings = [];
                                    let hasPermanentDeviations = false;

                                    // Validate scalability mode
                                    if (targetScalability !== 'L1T1') {
                                        const isSVCSupportedCodec = testParams.codecKey === 'VP9' || testParams.codecKey === 'AV1';
                                        if (!isSVCSupportedCodec) {
                                            const warningMsg = `⚠️ WebRTC silently bypassed the requested Scalability Mode (${targetScalability}) and fell back to standard singlecast L1T1 (H.264, H.265, and VP8 do not support SVC in WebRTC).`;
                                            warnings.push(warningMsg);
                                            activeScalability = 'L1T1 (Silent Fallback)';
                                            hasPermanentDeviations = true;
                                        } else if (activeScalability !== 'unknown' && activeScalability !== targetScalability) {
                                            const warningMsg = `⚠️ WebRTC downgraded Scalability Mode from requested ${targetScalability} to active ${activeScalability}.`;
                                            warnings.push(warningMsg);
                                            hasPermanentDeviations = true;
                                        }
                                    } else {
                                        if (activeScalability === 'unknown') activeScalability = 'L1T1 (Standard)';
                                    }

                                    isFinished = true;
                                    cleanup();
                                    resolve({
                                        success: true,
                                        logs,
                                        stats: {
                                            bytesSent,
                                            framesEncoded,
                                            negotiatedCodec: codecMime,
                                            resolution: currentRes,
                                            encoderImplementation: encoderImpl,
                                            decoderImplementation: decoderImpl,
                                            targetWidth, targetHeight, activeWidth: width, activeHeight: height,
                                            targetScalability, activeScalability,
                                            warnings, hasPermanentDeviations,
                                            resolutionHistory
                                        }
                                    });
                                    return;
                                } else {
                                    log(`Target resolution achieved. Awaiting asynchronous encoder/decoder implementation details...`);
                                }
                            }

                            // Case 2: Timeout reached but media is flowing (Resolution remains permanently throttled/downscaled)
                            if (isTimeoutReached && mediaFlowing && isMatchingCodec) {
                                log(`Allotted timeout (${elapsedSec}s) expired. Output resolution remained throttled at ${currentRes}. Resolving as passed with warnings.`);

                                const targetScalability = testParams.scalabilityMode || 'L1T1';
                                let activeScalability = outboundRtp.scalabilityMode || 'unknown';
                                const warnings = [];
                                let hasPermanentDeviations = true; // Permanent downscale throttle!

                                const limitReason = outboundRtp.qualityLimitationReason || 'unknown';
                                warnings.push(`⚠️ WebRTC failed to scale up resolution to target ${targetWidth}x${targetHeight} in the allotted time. Output remained throttled at ${currentRes} (Quality Limitation Reason: ${limitReason}).`);

                                if (targetScalability !== 'L1T1') {
                                    const isSVCSupportedCodec = testParams.codecKey === 'VP9' || testParams.codecKey === 'AV1';
                                    if (!isSVCSupportedCodec) {
                                        warnings.push(`⚠️ WebRTC silently bypassed the requested Scalability Mode (${targetScalability}) and fell back to standard singlecast L1T1 (H.264, H.265, and VP8 do not support SVC in WebRTC).`);
                                        activeScalability = 'L1T1 (Silent Fallback)';
                                    } else if (activeScalability !== 'unknown' && activeScalability !== targetScalability) {
                                        warnings.push(`⚠️ WebRTC downgraded Scalability Mode from requested ${targetScalability} to active ${activeScalability}.`);
                                    }
                                } else {
                                    if (activeScalability === 'unknown') activeScalability = 'L1T1 (Standard)';
                                }

                                isFinished = true;
                                cleanup();
                                resolve({
                                    success: true,
                                    logs,
                                    stats: {
                                        bytesSent,
                                        framesEncoded,
                                        negotiatedCodec: codecMime,
                                        resolution: currentRes,
                                        encoderImplementation: encoderImpl,
                                        decoderImplementation: decoderImpl,
                                        targetWidth, targetHeight, activeWidth: width, activeHeight: height,
                                        targetScalability, activeScalability,
                                        warnings, hasPermanentDeviations,
                                        resolutionHistory
                                    }
                                });
                                return;
                            }
                        }
                    } catch (err) {
                        log(`Error in statistics polling loop: ${err.message}`);
                    }
                } else {
                    log(`Waiting... Current ICE connection states: pc1=${state1}, pc2=${state2}`);
                }

                // Case 3: Timeout reached and NO media is flowing (Genuine Timeout Failure)
                if (isTimeoutReached) {
                    log(`Allotted timeout (${(elapsedMs / 1000).toFixed(1)}s) expired without loopback media flow. Failing test.`);
                    isFinished = true;
                    cleanup();
                    resolve({
                        success: false,
                        logs,
                        error: `Timeout expired. ICE state: pc1=${state1}, pc2=${state2}. Media Flowing: ${mediaFlowing}.`
                    });
                }
            }, 500); // Check stats every 500ms

        } catch (err) {
            log(`Catch block caught error: ${err.message || err.toString()}`);
            cleanup();
            resolve({ success: false, logs, error: err.message || err.toString() });
        }
    });
}

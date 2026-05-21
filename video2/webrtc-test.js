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

        // Timeout configuration
        const timeoutTracker = setTimeout(() => {
            if (isFinished) return;
            isFinished = true;
            cleanup();
            log(`WebRTC test timed out after ${testParams.timeoutMs}ms`);
            resolve({
                success: false,
                logs,
                error: 'Timed out waiting for connection, media flow, or correct codec negotiate.'
            });
        }, testParams.timeoutMs);

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
            let verifiedSuccess = false;
            let checkCount = 0;
            let lastBytesSent = 0;

            statsInterval = setInterval(async () => {
                if (isFinished) return;
                checkCount++;

                const state1 = pc1.iceConnectionState;
                const state2 = pc2.iceConnectionState;

                // Only start inspecting stats when ICE is connected
                if (state1 === 'connected' || state1 === 'completed') {
                    try {
                        const statsReport = await pc1.getStats();
                        let outboundRtp = null;
                        let codecObj = null;

                        // Traverse stats
                        statsReport.forEach(stat => {
                            if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
                                outboundRtp = stat;
                            }
                        });

                        if (outboundRtp) {
                            // Resolve codec configuration from stats
                            if (outboundRtp.codecId) {
                                const rawCodec = statsReport.get(outboundRtp.codecId);
                                if (rawCodec) {
                                    codecObj = rawCodec;
                                }
                            }

                            const bytesSent = outboundRtp.bytesSent || 0;
                            const width = outboundRtp.frameWidth || 0;
                            const height = outboundRtp.frameHeight || 0;
                            const framesEncoded = outboundRtp.framesEncoded || 0;
                            const codecMime = codecObj ? codecObj.mimeType : 'unknown';
                            const encoderImpl = outboundRtp.encoderImplementation || 'unknown';

                            log(`Stats update #${checkCount}: Bytes Sent = ${bytesSent}, Encoded Frames = ${framesEncoded}, Resolution = ${width}x${height}, Codec MIME = ${codecMime}, Encoder = ${encoderImpl}`);

                            // Success Criteria:
                            // 1. We have sent bytes and encoded frames.
                            // 2. The bytesSent count is actively increasing.
                            // 3. The codec used contains the target codec name.
                            if (bytesSent > lastBytesSent && framesEncoded > 0) {
                                const isMatchingCodec = codecMime.toLowerCase().includes(spec.webrtcCodecName.toLowerCase());
                                
                                if (isMatchingCodec) {
                                    log(`CRITICAL: Positive data flow verified using negotiated codec: ${codecMime} (${encoderImpl})`);
                                    verifiedSuccess = true;
                                    isFinished = true;
                                    clearTimeout(timeoutTracker);
                                    cleanup();
                                    resolve({
                                        success: true,
                                        logs,
                                        stats: {
                                            bytesSent,
                                            framesEncoded,
                                            negotiatedCodec: codecMime,
                                            resolution: `${width}x${height}`,
                                            encoderImplementation: encoderImpl
                                        }
                                    });
                                    return;
                                } else {
                                    log(`WARNING: Active media detected, but codec is ${codecMime} instead of target ${spec.webrtcCodecName}. Awaiting codec switch...`);
                                }
                            }
                            lastBytesSent = bytesSent;
                        }
                    } catch (err) {
                        log(`Error retrieving connection statistics: ${err.message}`);
                    }
                } else {
                    log(`Waiting... Current ICE connection states: pc1=${state1}, pc2=${state2}`);
                }

                // Handle negotiation failures (connection established but no packets/wrong codecs)
                if (checkCount > 20) {
                    log('Failure: Exceeded maximum stats validation checks without positive verified target media flow.');
                    isFinished = true;
                    clearTimeout(timeoutTracker);
                    cleanup();
                    resolve({
                        success: false,
                        logs,
                        error: `Negotiation failure. ICE connection established but target codec (${spec.webrtcCodecName}) did not transmit frames. Check if browser disabled/unsupported it.`
                    });
                }
            }, 500); // Check stats every 500ms

        } catch (err) {
            log(`Catch block caught error: ${err.message || err.toString()}`);
            cleanup();
            clearTimeout(timeoutTracker);
            resolve({ success: false, logs, error: err.message || err.toString() });
        }
    });
}
